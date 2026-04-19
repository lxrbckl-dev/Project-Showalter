'use client';

/**
 * Two-panel availability editor — the sole client component on
 * /admin/schedule.
 *
 *   Left  — Weekly template: 7-day grid (Sun..Sat). Each day lists its
 *           open windows and offers Add / Edit / Delete per window. A
 *           day with no windows is rendered as "Closed" with a hint.
 *           Every edit submits the full day's window set via
 *           `setTemplateDay(dow, windows[])`, consistent with the server
 *           action's "replace the day atomically" semantics.
 *
 *   Right — Date overrides: a date picker + list of existing overrides.
 *           Selecting a date shows two actions: "Mark closed" and "Mark
 *           open with custom windows". The latter opens the same
 *           window-editor used for template days but writes via
 *           `openDateWithWindows(date, windows[])`. "Clear override"
 *           restores the template for that date.
 *
 * Keeping everything in one component is intentional — the editor is
 * inherently interactive (staged window drafts, validation feedback,
 * pending state), so we don't gain anything by splitting across files at
 * this size. If it grows past ~400 lines we can extract.
 */

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  clearOverride,
  closeDate,
  openDateWithWindows,
  setTemplateDay,
} from '@/features/availability/actions';

type Window = { startTime: string; endTime: string; note?: string | null };
type TemplateMap = Record<
  number,
  Array<{ id: number; startTime: string; endTime: string; note: string | null }>
>;
type OverrideItem = {
  date: string;
  mode: string;
  note: string | null;
  createdAt: string;
  windows: Array<{ id: number; startTime: string; endTime: string }>;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ScheduleEditor({
  template,
  overrides,
}: {
  template: TemplateMap;
  overrides: OverrideItem[];
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <TemplatePanel template={template} />
      <OverridesPanel overrides={overrides} />
    </div>
  );
}

/* ======================================================================== */
/* Weekly template panel                                                    */
/* ======================================================================== */

function TemplatePanel({ template }: { template: TemplateMap }) {
  return (
    <section
      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
      aria-labelledby="template-heading"
    >
      <h2 id="template-heading" className="text-lg font-semibold">
        Weekly template
      </h2>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        Recurring availability. Empty = day is closed.
      </p>

      <div className="mt-4 space-y-3">
        {DAY_NAMES.map((name, dow) => (
          <DayRow
            key={dow}
            dow={dow}
            label={name}
            initial={template[dow] ?? []}
          />
        ))}
      </div>
    </section>
  );
}

function DayRow({
  dow,
  label,
  initial,
}: {
  dow: number;
  label: string;
  initial: Array<{ id: number; startTime: string; endTime: string; note: string | null }>;
}) {
  // Local staged draft — committed when the admin taps Save.
  const [draft, setDraft] = useState<Window[]>(initial.map(stripId));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addWindow() {
    setDraft((d) => [...d, { startTime: '09:00', endTime: '17:00' }]);
    setEditing(true);
  }

  function removeWindow(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
    setEditing(true);
  }

  function updateWindow(idx: number, patch: Partial<Window>) {
    setDraft((d) => d.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setTemplateDay(dow, draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  function cancel() {
    setDraft(initial.map(stripId));
    setEditing(false);
    setError(null);
  }

  return (
    <div
      data-testid={`template-day-${dow}`}
      className="rounded-md border border-[hsl(var(--border))] p-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-10 text-sm font-medium">{label}</span>
          {draft.length === 0 ? (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Closed
            </span>
          ) : (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {draft.length} window{draft.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addWindow}
            data-testid={`template-day-${dow}-add`}
          >
            Add window
          </Button>
        </div>
      </div>

      {draft.length > 0 && (
        <ul className="mt-3 space-y-2">
          {draft.map((w, idx) => (
            <li
              key={idx}
              className="flex flex-wrap items-center gap-2"
              data-testid={`template-day-${dow}-window-${idx}`}
            >
              <Input
                type="time"
                value={w.startTime}
                onChange={(e) => updateWindow(idx, { startTime: e.target.value })}
                aria-label="start time"
                className="w-28"
              />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">–</span>
              <Input
                type="time"
                value={w.endTime}
                onChange={(e) => updateWindow(idx, { endTime: e.target.value })}
                aria-label="end time"
                className="w-28"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeWindow(idx)}
                aria-label={`Remove window ${idx + 1}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending}
            data-testid={`template-day-${dow}-save`}
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancel}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 text-xs text-[hsl(var(--destructive))]"
          data-testid={`template-day-${dow}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function stripId<T extends { id?: number }>(row: T): Omit<T, 'id'> {
  const { id: _discard, ...rest } = row;
  void _discard;
  return rest;
}

/* ======================================================================== */
/* Date overrides panel                                                     */
/* ======================================================================== */

function OverridesPanel({ overrides }: { overrides: OverrideItem[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [openDraft, setOpenDraft] = useState<Window[]>([]);
  const [showOpenEditor, setShowOpenEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function doClose() {
    setError(null);
    startTransition(async () => {
      const res = await closeDate(date, note || null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote('');
    });
  }

  function doOpen() {
    setError(null);
    startTransition(async () => {
      const res = await openDateWithWindows(date, openDraft, note || null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote('');
      setOpenDraft([]);
      setShowOpenEditor(false);
    });
  }

  function doClear(d: string) {
    setError(null);
    startTransition(async () => {
      const res = await clearOverride(d);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <section
      className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
      aria-labelledby="overrides-heading"
    >
      <h2 id="overrides-heading" className="text-lg font-semibold">
        Date overrides
      </h2>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        Override the template for a specific date.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="override-date" className="block text-xs font-medium">
              Date
            </label>
            <Input
              id="override-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
              data-testid="override-date-input"
            />
          </div>
          <div className="grow">
            <label htmlFor="override-note" className="block text-xs font-medium">
              Note (optional)
            </label>
            <Input
              id="override-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. out of town"
              data-testid="override-note-input"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={doClose}
            disabled={pending}
            data-testid="override-close-button"
          >
            {pending ? 'Saving…' : 'Mark closed'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowOpenEditor((v) => !v)}
            disabled={pending}
            data-testid="override-open-toggle"
          >
            {showOpenEditor ? 'Cancel open override' : 'Mark open with custom windows'}
          </Button>
        </div>

        {showOpenEditor && (
          <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-3">
            <WindowListEditor
              windows={openDraft}
              onChange={setOpenDraft}
              testidPrefix="override-open"
            />
            <Button
              type="button"
              className="mt-3"
              onClick={doOpen}
              disabled={pending}
              data-testid="override-open-save"
            >
              {pending ? 'Saving…' : 'Save open override'}
            </Button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-xs text-[hsl(var(--destructive))]"
            data-testid="override-error"
          >
            {error}
          </p>
        )}
      </div>

      <h3 className="mt-6 text-sm font-semibold">Existing overrides</h3>
      {overrides.length === 0 ? (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          No overrides yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {overrides.map((o) => (
            <li
              key={o.date}
              className="flex flex-col gap-1 rounded-md border border-[hsl(var(--border))] p-2"
              data-testid={`override-item-${o.date}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{o.date}</span>
                  <span
                    className={
                      o.mode === 'closed'
                        ? 'rounded bg-red-100 px-2 py-0.5 text-xs text-red-900'
                        : 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-900'
                    }
                  >
                    {o.mode}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => doClear(o.date)}
                  disabled={pending}
                  data-testid={`override-item-${o.date}-clear`}
                >
                  Clear
                </Button>
              </div>
              {o.note && (
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {o.note}
                </span>
              )}
              {o.mode === 'open' && o.windows.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {o.windows.map((w) => (
                    <li
                      key={w.id}
                      className="text-xs text-[hsl(var(--muted-foreground))]"
                    >
                      {w.startTime} – {w.endTime}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ======================================================================== */
/* Shared window list editor (used by the override-open editor)             */
/* ======================================================================== */

function WindowListEditor({
  windows,
  onChange,
  testidPrefix,
}: {
  windows: Window[];
  onChange: (next: Window[]) => void;
  testidPrefix: string;
}) {
  function add() {
    onChange([...windows, { startTime: '09:00', endTime: '17:00' }]);
  }
  function remove(i: number) {
    onChange(windows.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<Window>) {
    onChange(windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }
  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={add}
        data-testid={`${testidPrefix}-add`}
      >
        Add window
      </Button>
      {windows.length > 0 && (
        <ul className="mt-2 space-y-2">
          {windows.map((w, idx) => (
            <li
              key={idx}
              className="flex flex-wrap items-center gap-2"
              data-testid={`${testidPrefix}-window-${idx}`}
            >
              <Input
                type="time"
                value={w.startTime}
                onChange={(e) => update(idx, { startTime: e.target.value })}
                className="w-28"
                aria-label="start time"
              />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">–</span>
              <Input
                type="time"
                value={w.endTime}
                onChange={(e) => update(idx, { endTime: e.target.value })}
                className="w-28"
                aria-label="end time"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(idx)}
                aria-label={`Remove window ${idx + 1}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
