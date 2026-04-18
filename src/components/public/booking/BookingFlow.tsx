'use client';

import { useMemo, useState, useTransition } from 'react';
import type { ServiceRow } from '@/db/schema/services';
import type { CustomerDay } from '@/features/bookings/availability-for-customer';
import { submitBooking, type SubmitResult } from '@/features/bookings/submit';

/**
 * BookingFlow — 4-step public booking UI (Phase 5).
 *
 *   Step 1: pick a day           (only days with candidates are clickable)
 *   Step 2: pick a start time    (list of labels for the selected day)
 *   Step 3: fill the form        (service, name, phone, email, address, notes, photos, honeypot)
 *   Step 4: submit + redirect    (to /bookings/<token>)
 *
 * Progressive enhancement note: the server action `submitBooking` accepts
 * plain FormData, so non-JS clients could in theory POST directly. In
 * practice the multi-step UI relies on JS state, so the flow fails closed
 * (no <noscript> fallback) — Sawyer's customer base all use smartphones
 * with JS enabled.
 */

export interface BookingFlowProps {
  availability: CustomerDay[];
  services: ServiceRow[];
}

type Step = 'day' | 'slot' | 'form' | 'submitting';

/** Render YYYY-MM-DD as a friendly "Mon, Apr 20" string. */
function formatDateLabel(dateIso: string): string {
  // Parse as local date (NOT UTC) so "2026-04-20" stays on Apr 20 regardless
  // of the client's timezone. The day picker already uses site-tz calendar
  // days (resolved server-side).
  const [y, m, d] = dateIso.split('-').map((p) => Number.parseInt(p, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function BookingFlow({ availability, services }: BookingFlowProps) {
  const [step, setStep] = useState<Step>('day');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const dayLookup = useMemo(() => {
    const m = new Map<string, CustomerDay>();
    for (const day of availability) m.set(day.date, day);
    return m;
  }, [availability]);

  const selectedDay = selectedDate ? dayLookup.get(selectedDate) : undefined;

  function handleDayPick(date: string): void {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep('slot');
  }

  function handleSlotPick(startAt: string): void {
    setSelectedSlot(startAt);
    setStep('form');
  }

  function backToDay(): void {
    setStep('day');
    setSelectedDate(null);
    setSelectedSlot(null);
  }

  function backToSlot(): void {
    setStep('slot');
    setSelectedSlot(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);
    setStep('submitting');
    startTransition(async () => {
      const result: SubmitResult = await submitBooking(formData);
      if (result.ok) {
        // Redirect to the tokenized customer booking page. Using
        // window.location so the page is a fresh request — the server
        // component on /bookings/[token] re-reads the DB.
        window.location.assign(`/bookings/${result.token}`);
        return;
      }
      if (result.kind === 'validation') {
        setFieldErrors(result.fieldErrors);
        setSubmitError('Please fix the errors below.');
      } else if (result.kind === 'slot_taken') {
        setSubmitError(
          'That slot was just taken — please pick another time.',
        );
        setStep('day');
        setSelectedDate(null);
        setSelectedSlot(null);
      } else if (result.kind === 'rate_limited') {
        setSubmitError(
          'Too many submissions from your network — please try again later.',
        );
        setStep('form');
      } else if (result.kind === 'service_inactive') {
        setSubmitError('That service is no longer offered — pick another.');
        setStep('form');
      } else {
        setSubmitError(
          'Something went wrong on our end — please try again in a minute.',
        );
        setStep('form');
      }
    });
  }

  if (step === 'day') {
    return (
      <DayPicker
        availability={availability}
        onPick={handleDayPick}
        bannerError={submitError}
      />
    );
  }

  if (step === 'slot' && selectedDay) {
    return (
      <SlotPicker
        day={selectedDay}
        onPick={handleSlotPick}
        onBack={backToDay}
      />
    );
  }

  if ((step === 'form' || step === 'submitting') && selectedDate && selectedSlot) {
    return (
      <BookingForm
        date={selectedDate}
        startAt={selectedSlot}
        slotLabel={
          selectedDay?.candidates.find((c) => c.startAt === selectedSlot)?.label ?? ''
        }
        services={services}
        onBack={backToSlot}
        onSubmit={handleSubmit}
        submitError={submitError}
        fieldErrors={fieldErrors}
        isSubmitting={isPending || step === 'submitting'}
      />
    );
  }

  // Fallback — shouldn't be reachable.
  return (
    <button
      type="button"
      className="text-green-300 underline"
      onClick={backToDay}
    >
      Start over
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step 1: day picker
// ---------------------------------------------------------------------------
function DayPicker({
  availability,
  onPick,
  bannerError,
}: {
  availability: CustomerDay[];
  onPick: (date: string) => void;
  bannerError: string | null;
}) {
  return (
    <section aria-label="Pick a day">
      {bannerError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-600 bg-red-950/60 px-4 py-3 text-sm text-red-100"
        >
          {bannerError}
        </div>
      )}
      <h2 className="mb-4 text-lg font-semibold">Pick a day</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {availability.map((day) => {
          const open = day.candidates.length > 0;
          return (
            <button
              type="button"
              key={day.date}
              disabled={!open}
              onClick={() => onPick(day.date)}
              data-testid={`day-${day.date}`}
              data-open={open ? '1' : '0'}
              className={
                open
                  ? 'rounded-md border border-green-700 bg-green-950/40 px-3 py-3 text-center text-sm font-medium text-green-100 transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-400'
                  : 'cursor-not-allowed rounded-md border border-gray-800 bg-gray-950/40 px-3 py-3 text-center text-sm text-gray-600'
              }
            >
              <span className="block">{formatDateLabel(day.date)}</span>
              <span className="mt-0.5 block text-xs opacity-70">
                {open ? `${day.candidates.length} open` : 'closed'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2: slot picker
// ---------------------------------------------------------------------------
function SlotPicker({
  day,
  onPick,
  onBack,
}: {
  day: CustomerDay;
  onPick: (startAt: string) => void;
  onBack: () => void;
}) {
  return (
    <section aria-label="Pick a start time">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-green-300 hover:text-green-100"
      >
        &larr; Back to days
      </button>
      <h2 className="mb-4 text-lg font-semibold">
        Pick a start time — {formatDateLabel(day.date)}
      </h2>
      <ul className="space-y-2">
        {day.candidates.map((c) => (
          <li key={c.startAt}>
            <button
              type="button"
              onClick={() => onPick(c.startAt)}
              data-testid={`slot-${c.startAt}`}
              className="w-full rounded-md border border-green-700 bg-green-950/40 px-4 py-3 text-left font-medium text-green-100 transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3: booking form
// ---------------------------------------------------------------------------
function BookingForm({
  date,
  startAt,
  slotLabel,
  services,
  onBack,
  onSubmit,
  submitError,
  fieldErrors,
  isSubmitting,
}: {
  date: string;
  startAt: string;
  slotLabel: string;
  services: ServiceRow[];
  onBack: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  submitError: string | null;
  fieldErrors: Record<string, string[]>;
  isSubmitting: boolean;
}) {
  function err(field: string): string | undefined {
    return fieldErrors[field]?.[0];
  }

  return (
    <section aria-label="Request details">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-green-300 hover:text-green-100"
      >
        &larr; Back to times
      </button>
      <h2 className="mb-1 text-lg font-semibold">Your details</h2>
      <p className="mb-4 text-sm text-gray-400">
        {formatDateLabel(date)} &middot; {slotLabel}
      </p>

      {submitError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-600 bg-red-950/60 px-4 py-3 text-sm text-red-100"
        >
          {submitError}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-4"
        encType="multipart/form-data"
        data-testid="booking-form"
      >
        <input type="hidden" name="startAt" value={startAt} />

        <Field
          label="Service"
          name="serviceId"
          error={err('serviceId')}
          render={(id) => (
            <select
              id={id}
              name="serviceId"
              required
              defaultValue=""
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            >
              <option value="" disabled>
                — choose one —
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        />

        <Field
          label="Your name"
          name="name"
          error={err('name')}
          render={(id) => (
            <input
              id={id}
              name="name"
              type="text"
              required
              maxLength={100}
              autoComplete="name"
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Phone"
          name="phone"
          error={err('phone')}
          render={(id) => (
            <input
              id={id}
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="(913) 309-7340"
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Email (optional)"
          name="email"
          error={err('email')}
          render={(id) => (
            <input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Service address"
          name="address"
          error={err('address')}
          render={(id) => (
            <input
              id={id}
              name="address"
              type="text"
              required
              maxLength={500}
              autoComplete="street-address"
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Notes (optional)"
          name="notes"
          error={err('notes')}
          render={(id) => (
            <textarea
              id={id}
              name="notes"
              rows={3}
              maxLength={2000}
              placeholder="Gate code, yard size, anything else Sawyer should know"
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Photos (optional)"
          name="photos"
          error={err('photos')}
          render={(id) => (
            <input
              id={id}
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              multiple
              className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-2 file:text-white hover:file:bg-green-600"
            />
          )}
        />

        {/*
          Honeypot: hidden visually + from screen readers. Real users never
          touch it; bots that fill every input they see will trip the
          silent-success response on the server. Using `aria-hidden` +
          off-screen positioning + tabindex="-1" per STACK.md.
        */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-10000px',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
        >
          <label htmlFor="website-url">
            Do not fill this in
            <input
              id="website-url"
              name="honeypot"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="booking-submit"
          className="inline-flex items-center justify-center rounded-md bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  error,
  render,
}: {
  label: string;
  name: string;
  error?: string;
  render: (id: string) => React.ReactNode;
}) {
  const id = `booking-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-200">
        {label}
      </label>
      {render(id)}
      {error && (
        <p
          role="alert"
          data-testid={`error-${name}`}
          className="mt-1 text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
