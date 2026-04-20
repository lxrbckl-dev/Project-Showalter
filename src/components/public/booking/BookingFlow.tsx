'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

// Umami analytics helper — no-op when umami is not loaded.
function trackUmami(event: string): void {
  if (typeof window !== 'undefined' && typeof (window as Window & { umami?: { track: (e: string) => void } }).umami?.track === 'function') {
    (window as Window & { umami?: { track: (e: string) => void } }).umami!.track(event);
  }
}
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
        // Track successful booking submission before redirect.
        trackUmami('booking_submitted');
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
      className="text-green-700 underline"
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
  // On mount, snap the scroll viewport so today's row is at the top of the
  // visible region. We grab today as YYYY-MM-DD in the browser's local tz
  // (matches `availability[].date` shape) and scroll that row's `offsetTop`.
  // No-op if today isn't in the list — the natural top stays.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const target = container.querySelector<HTMLElement>(
      `[data-date="${todayIso}"]`,
    );
    if (target) {
      container.scrollTop = target.offsetTop - container.offsetTop;
    }
  }, [availability]);

  return (
    <section aria-label="Pick a day">
      {bannerError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {bannerError}
        </div>
      )}
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Pick a day</h2>
      {/* Single-column scrollable list. Capped height keeps the form below
        anchored; the useEffect above scrolls today into view on mount. */}
      <div
        ref={scrollRef}
        className="max-h-[24rem] overflow-y-auto rounded-md border border-gray-200 p-2"
      >
        <div className="flex flex-col gap-2">
          {availability.map((day) => {
            const open = day.candidates.length > 0;
            return (
              <button
                type="button"
                key={day.date}
                data-date={day.date}
                disabled={!open}
                onClick={() => onPick(day.date)}
                data-testid={`day-${day.date}`}
                data-open={open ? '1' : '0'}
                className={
                  open
                    ? 'rounded-md border border-green-300 bg-green-50 px-3 py-3 text-center text-sm font-medium text-green-800 transition hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-400'
                    : 'cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-center text-sm text-gray-400'
                }
              >
                {formatDateLabel(day.date)}
              </button>
            );
          })}
        </div>
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
        className="mb-4 text-sm text-green-700 hover:text-green-600"
      >
        &larr; Back to days
      </button>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Pick a start time — {formatDateLabel(day.date)}
      </h2>
      <ul className="space-y-2">
        {day.candidates.map((c) => (
          <li key={c.startAt}>
            <button
              type="button"
              onClick={() => onPick(c.startAt)}
              data-testid={`slot-${c.startAt}`}
              className="w-full rounded-md border border-green-300 bg-green-50 px-4 py-3 text-left font-medium text-green-800 transition hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-400"
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

  // "Use my location" button — uses the browser's geolocation API to grab
  // lat/lng (with permission), then reverse-geocodes via OSM Nominatim to
  // get a street address and writes it into the address input. The input
  // stays uncontrolled, so we mutate it via ref + dispatch an `input` event
  // so any listeners (and React's diff) see the change.
  const addressRef = useRef<HTMLInputElement>(null);
  const [locStatus, setLocStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'requesting' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // Track form-level HTML5 validity so the submit button only enables once
  // every required field is filled (and any optional Email is well-formed).
  // Recomputed on every keystroke / select change via the form's onChange.
  const [formValid, setFormValid] = useState(false);

  async function useMyLocation(): Promise<void> {
    if (!('geolocation' in navigator)) {
      setLocStatus({
        kind: 'error',
        message: 'Your browser does not support location.',
      });
      return;
    }
    setLocStatus({ kind: 'requesting' });
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
        });
      });
      const { latitude, longitude } = pos.coords;
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`reverse geocode failed (${res.status})`);
      const data = (await res.json()) as { display_name?: string };
      if (!data.display_name) throw new Error('no address returned');
      // Trim trailing ", United States" — domestic users don't want it.
      const cleaned = data.display_name.replace(/,\s*United States$/, '');
      if (addressRef.current) {
        addressRef.current.value = cleaned;
        addressRef.current.dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      }
      setLocStatus({ kind: 'idle' });
    } catch (e) {
      const code = (e as GeolocationPositionError | undefined)?.code;
      let message = 'Could not get your location.';
      if (code === 1) message = 'Location permission denied.';
      else if (code === 2) message = 'Location unavailable.';
      else if (code === 3) message = 'Location request timed out.';
      else if (e instanceof Error) message = e.message;
      setLocStatus({ kind: 'error', message });
    }
  }

  return (
    <section aria-label="Request details">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-green-700 hover:text-green-600"
      >
        &larr; Back to times
      </button>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Your details</h2>
      <p className="mb-4 text-sm text-gray-500">
        {formatDateLabel(date)} &middot; {slotLabel}
      </p>

      {submitError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        onChange={(e) => setFormValid(e.currentTarget.checkValidity())}
        onInput={(e) => setFormValid(e.currentTarget.checkValidity())}
        className="space-y-2.5"
        encType="multipart/form-data"
        data-testid="booking-form"
      >
        <input type="hidden" name="startAt" value={startAt} />

        <Field
          label="Service"
          name="serviceId"
          required
          error={err('serviceId')}
          render={(id) => (
            <select
              id={id}
              name="serviceId"
              required
              defaultValue=""
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:border-green-500 focus:outline-none"
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

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field
            label="Your name"
            name="name"
            required
            error={err('name')}
            render={(id) => (
              <input
                id={id}
                name="name"
                type="text"
                required
                maxLength={100}
                autoComplete="name"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:border-green-500 focus:outline-none"
              />
            )}
          />

          <Field
            label="Phone"
            name="phone"
            required
            error={err('phone')}
            render={(id) => (
              <input
                id={id}
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="(913) 309-7340"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:border-green-500 focus:outline-none"
              />
            )}
          />
        </div>

        <Field
          label="Email"
          name="email"
          error={err('email')}
          render={(id) => (
            <input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Address"
          name="address"
          required
          error={err('address')}
          render={(id) => (
            <div>
              <div className="flex gap-2">
                <input
                  ref={addressRef}
                  id={id}
                  name="address"
                  type="text"
                  required
                  maxLength={500}
                  autoComplete="street-address"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:border-green-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locStatus.kind === 'requesting'}
                  data-testid="use-my-location"
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Use my current location"
                  title="Use my current location"
                >
                  {locStatus.kind === 'requesting' ? '…' : '📍'}
                </button>
              </div>
              {locStatus.kind === 'error' && (
                <p
                  role="alert"
                  data-testid="location-error"
                  className="mt-1 text-xs text-red-600"
                >
                  {locStatus.message}
                </p>
              )}
            </div>
          )}
        />

        <Field
          label="Notes"
          name="notes"
          error={err('notes')}
          render={(id) => (
            <textarea
              id={id}
              name="notes"
              rows={2}
              maxLength={2000}
              placeholder="Gate code, yard size, anything else Sawyer should know"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 focus:border-green-500 focus:outline-none"
            />
          )}
        />

        <Field
          label="Photos"
          name="photos"
          error={err('photos')}
          render={(id) => (
            <input
              id={id}
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              multiple
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-2 file:text-white hover:file:bg-green-600"
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

        <hr className="border-gray-200" />

        <button
          type="submit"
          disabled={isSubmitting || !formValid}
          data-testid="booking-submit"
          data-umami-event="booking_submitted"
          className="flex w-full items-center justify-center rounded-md bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 disabled:cursor-not-allowed disabled:opacity-60"
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
  required,
  render,
}: {
  label: string;
  name: string;
  error?: string;
  /** When true, renders a red asterisk next to the label as a visual cue. */
  required?: boolean;
  render: (id: string) => React.ReactNode;
}) {
  const id = `booking-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-600">
            *
          </span>
        )}
      </label>
      {render(id)}
      {error && (
        <p
          role="alert"
          data-testid={`error-${name}`}
          className="mt-1 text-sm text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
