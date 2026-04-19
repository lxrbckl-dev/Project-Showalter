'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminCreateBooking,
  type AdminCreateResult,
} from '@/features/bookings/admin-create';

/**
 * Walk-in admin booking form — Phase 6.
 *
 * Two modes, toggleable:
 *   - "Pick existing customer" — dropdown + type-to-filter over the recent
 *     customers seeded by the server. Picking one reveals the service /
 *     start / notes fields only. Optional address override when the
 *     customer has multiple addresses on file.
 *   - "+ New customer"          — inline name / phone / email / address
 *                                 fields. Phone validation happens
 *                                 server-side.
 *
 * Soft warnings: when the server returns `kind: 'warnings'`, we render a
 * banner and swap the submit button to "Submit anyway" which re-sends the
 * same payload with `force=true`.
 */

export type CustomerSummary = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  primaryAddress: string | null;
};

export type ServiceSummary = { id: number; name: string };

export function WalkInForm({
  timezone,
  services,
  initialCustomers,
}: {
  timezone: string;
  services: ServiceSummary[];
  initialCustomers: CustomerSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<'existing' | 'new'>(
    initialCustomers.length > 0 ? 'existing' : 'new',
  );
  // Start unselected so the form doesn't pre-commit to whichever customer
  // happens to be at the top of the recent-customers list. Sawyer picks
  // whoever this booking is for.
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // No default — Sawyer picks the service explicitly so a wrong service
  // doesn't get committed by accident.
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [startAtLocal, setStartAtLocal] = useState('');
  const [notes, setNotes] = useState('');

  // Default the start-time field to "now" (browser local clock) once mounted.
  // We initialize to '' first so server-rendered HTML matches the first client
  // render — populating with `new Date()` directly inside useState would cause
  // a hydration mismatch since the server and client compute slightly
  // different timestamps.
  useEffect(() => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    setStartAtLocal(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
    );
  }, []);

  // When the admin picks (or switches) the customer, prefill the Address
  // input with that customer's primary address so they don't have to retype
  // it. The field is still freely editable afterward — it's a starting
  // value, not a lock. Clearing the selection clears the address too,
  // matching what `address` represented before the pick.
  useEffect(() => {
    if (selectedCustomerId === null) {
      setAddress('');
      return;
    }
    const picked = initialCustomers.find((c) => c.id === selectedCustomerId);
    setAddress(picked?.primaryAddress ?? '');
  }, [selectedCustomerId, initialCustomers]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
    {},
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<
    AdminCreateResult & { ok: false; kind: 'warnings' } | null
  >(null);

  function buildFormData(force: boolean): FormData {
    const fd = new FormData();
    if (serviceId !== null) fd.set('serviceId', String(serviceId));
    if (startAtLocal) {
      const asDate = new Date(startAtLocal);
      if (!Number.isNaN(asDate.getTime())) {
        fd.set('startAt', asDate.toISOString());
      }
    }
    fd.set('notes', notes);
    fd.set('force', force ? 'true' : 'false');
    if (mode === 'existing' && selectedCustomerId) {
      fd.set('customerId', String(selectedCustomerId));
      if (address) fd.set('address', address);
    } else {
      fd.set('name', name);
      fd.set('phone', phone);
      if (email) fd.set('email', email);
      fd.set('address', address);
    }
    return fd;
  }

  function submit(force: boolean): void {
    setFieldErrors({});
    setMessage(null);
    if (mode === 'existing' && selectedCustomerId === null) {
      setMessage('Pick a customer first, or switch to New.');
      return;
    }
    if (serviceId === null) {
      setMessage('Pick a service first.');
      return;
    }
    const fd = buildFormData(force);
    startTransition(async () => {
      const result = await adminCreateBooking(fd);
      if (result.ok) {
        router.push(`/admin/inbox/${result.booking.id}`);
        return;
      }
      if (result.kind === 'validation') {
        setFieldErrors(result.fieldErrors);
        setMessage('Please fix the errors above.');
      } else if (result.kind === 'warnings') {
        setPendingWarnings(result);
        setMessage(
          'Heads up — this booking triggers a soft warning. Submit anyway if intentional.',
        );
      } else if (result.kind === 'slot_taken') {
        setMessage(
          'That exact start time is already booked — pick another.',
        );
      } else if (result.kind === 'service_inactive') {
        setMessage('That service is no longer active.');
      } else if (result.kind === 'customer_not_found') {
        setMessage('The selected customer could not be loaded.');
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    });
  }

  const selectedCustomer = initialCustomers.find(
    (c) => c.id === selectedCustomerId,
  ) ?? null;

  return (
    <form
      data-testid="walkin-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-6"
    >
      <section className="space-y-5 rounded-md border border-[hsl(var(--border))] p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Customer</h2>
          <div className="ml-auto flex gap-2 text-xs">
            <button
              type="button"
              data-testid="mode-existing"
              onClick={() => setMode('existing')}
              className={cx(
                'rounded-md px-2 py-1',
                mode === 'existing'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'border border-[hsl(var(--border))]',
              )}
            >
              Existing
            </button>
            <button
              type="button"
              data-testid="mode-new"
              onClick={() => setMode('new')}
              className={cx(
                'rounded-md px-2 py-1',
                mode === 'new'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'border border-[hsl(var(--border))]',
              )}
            >
              New
            </button>
          </div>
        </div>

        {mode === 'existing' ? (
          <div className="space-y-3">
            <CustomerCombobox
              customers={initialCustomers}
              selectedId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
            />
            {selectedCustomer && (
              <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-3 text-xs text-[hsl(var(--muted-foreground))]">
                <div>
                  <strong>{selectedCustomer.name}</strong> · {selectedCustomer.phone}
                  {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ''}
                </div>
                {selectedCustomer.primaryAddress && (
                  <div>Last address: {selectedCustomer.primaryAddress}</div>
                )}
              </div>
            )}
            <label className="flex flex-col text-sm">
              Address
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={
                  selectedCustomer?.primaryAddress ?? 'Service address'
                }
                data-testid="input-address"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.address} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-sm">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-name"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.name} />
            </label>
            <label className="flex flex-col text-sm">
              Phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-phone"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.phone} />
            </label>
            <label className="flex flex-col text-sm">
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.email} />
            </label>
            <label className="flex flex-col text-sm sm:col-span-2">
              Address
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                data-testid="input-address"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.address} />
            </label>
          </div>
        )}

        <div className="border-t border-[hsl(var(--border))] pt-5">
          <h2 className="mb-3 text-lg font-semibold">Booking</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-sm">
              Service
              <select
                value={serviceId ?? ''}
                onChange={(e) =>
                  setServiceId(e.target.value ? Number(e.target.value) : null)
                }
                data-testid="select-service"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              >
                <option value="">— pick a service —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors.serviceId} />
            </label>
            <label className="flex flex-col text-sm">
              Start time (local, {timezone})
              <input
                type="datetime-local"
                value={startAtLocal}
                onChange={(e) => setStartAtLocal(e.target.value)}
                data-testid="input-start-at"
                className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
              />
              <FieldError errors={fieldErrors.startAt} />
            </label>
          </div>
          <label className="mt-3 flex flex-col text-sm">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-notes"
              className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
            />
            <FieldError errors={fieldErrors.notes} />
          </label>
        </div>
      </section>

      {pendingWarnings && (
        <div
          role="alert"
          data-testid="warnings-banner"
          className="rounded-md border border-yellow-700 bg-yellow-950/30 p-3 text-sm text-yellow-200"
        >
          <div className="mb-2 font-medium">Soft warnings:</div>
          <ul className="list-disc pl-5">
            {pendingWarnings.warnings.map((w, i) => (
              <li key={i}>
                {w.kind === 'too_soon'
                  ? `Start time is inside the ${w.minAdvanceNoticeHours}-hour advance-notice window.`
                  : `Another booking is within ${w.spacingMinutes} minutes of this slot (${w.heldStartAt}).`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <p role="status" data-testid="form-message" className="text-sm">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        {!pendingWarnings ? (
          <button
            type="submit"
            disabled={isPending}
            data-testid="submit-walkin"
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
          >
            {isPending ? 'Creating…' : 'Create booking'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(true)}
              data-testid="submit-walkin-force"
              className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isPending ? 'Submitting…' : 'Submit anyway'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setPendingWarnings(null);
                setMessage(null);
              }}
              className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm"
            >
              Edit and retry
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <span className="mt-1 text-xs text-red-400" role="alert">
      {errors.join(' · ')}
    </span>
  );
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Searchable customer picker — type to filter, click to select.
 *
 * Filters across name / phone / email (case-insensitive substring). Picking
 * a row commits the id upward and closes the dropdown. Re-focusing the input
 * reopens it. Clicking outside closes it.
 */
function CustomerCombobox({
  customers,
  selectedId,
  onSelect,
}: {
  customers: CustomerSummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep the input synced to the selected customer's display name (after a
  // pick, or when the parent clears the selection externally).
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (selected) setQuery(`${selected.name} · ${selected.phone}`);
    else setQuery('');
  }, [selected]);

  // Dismiss the dropdown on any click outside the wrapper.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const isShowingPicked =
    selected && needle === `${selected.name} · ${selected.phone}`.toLowerCase();
  // When the input still shows the picked customer's label verbatim (no edit
  // since the pick), don't filter — show the full list so the admin can
  // browse to a different one.
  const filtered = isShowingPicked
    ? customers
    : needle.length === 0
      ? customers
      : customers.filter((c) => {
          const hay = `${c.name} ${c.phone} ${c.email ?? ''}`.toLowerCase();
          return hay.includes(needle);
        });

  return (
    <div ref={wrapperRef} className="relative space-y-1">
      <label className="flex flex-col text-sm">
        Pick Customer
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // Typing invalidates any prior selection — clear it so the
            // address-prefill / submit guard react correctly.
            if (selectedId !== null) onSelect(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            customers.length === 0
              ? 'No customers yet'
              : 'Type a name, phone, or email…'
          }
          disabled={customers.length === 0}
          data-testid="select-customer"
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
        />
      </label>
      {open && customers.length > 0 && (
        <ul
          data-testid="customer-options"
          className="absolute z-10 max-h-64 w-full overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1 text-sm shadow-md"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              No matches
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid={`customer-option-${c.id}`}
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-[hsl(var(--accent))]"
                >
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
                    {c.phone}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
