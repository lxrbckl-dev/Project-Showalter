'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  rescheduleBooking,
  type RescheduleResult,
} from '@/features/bookings/reschedule';

/**
 * Reschedule UI — inline datetime-local input + submit.
 *
 * Keeps the surface minimal: Sawyer enters a new local wall-clock time and
 * the server converts it into a UTC ISO string via the browser's Intl layer
 * (we serialize via `toISOString()` which is always UTC). The server action
 * does the transactional cancel-old + create-new; we route to the new
 * booking's detail page on success.
 */
export function RescheduleControls({
  bookingId,
  expectedUpdatedAt,
  timezone,
}: {
  bookingId: number;
  expectedUpdatedAt: string;
  timezone: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [datetimeLocal, setDatetimeLocal] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Format `now` as the `YYYY-MM-DDTHH:MM` string the datetime-local input
  // expects, in the BROWSER's local timezone (matches what the user sees in
  // the picker). Computed lazily on click — never in a useState initializer
  // — to avoid SSR/CSR hydration mismatches.
  function nowAsDatetimeLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openForm(): void {
    setDatetimeLocal((prev) => prev || nowAsDatetimeLocal());
    setIsOpen(true);
  }

  function handle(result: RescheduleResult): void {
    if (result.ok) {
      setMessage(null);
      router.push(`/admin/inbox/${result.newBooking.id}`);
      return;
    }
    if (result.kind === 'conflict') {
      setMessage('Someone else updated this booking — refresh to see the latest.');
    } else if (result.kind === 'invalid_transition') {
      setMessage(
        `Can't reschedule — the booking is now "${result.currentStatus.replace('_', ' ')}".`,
      );
    } else if (result.kind === 'slot_taken') {
      setMessage('That time is already booked — pick another slot.');
    } else if (result.kind === 'not_found') {
      setMessage('This booking no longer exists.');
    } else {
      setMessage('Something went wrong. Please try again.');
    }
  }

  function submit(): void {
    if (!datetimeLocal) {
      setMessage('Please pick a new date and time.');
      return;
    }
    // datetime-local yields 'YYYY-MM-DDTHH:MM' (local wall-clock per the
    // browser / user's OS). `new Date(localStr)` interprets it as local time
    // and toISOString() converts to UTC. This matches the public booking
    // flow's convention of storing UTC in `bookings.start_at`.
    const asDate = new Date(datetimeLocal);
    if (Number.isNaN(asDate.getTime())) {
      setMessage('Invalid date/time.');
      return;
    }
    const iso = asDate.toISOString();
    setMessage(null);
    startTransition(async () => {
      const result = await rescheduleBooking(bookingId, expectedUpdatedAt, iso);
      handle(result);
    });
  }

  if (!isOpen) {
    return (
      <div>
        <button
          type="button"
          onClick={openForm}
          data-testid="action-reschedule-open"
          className="rounded-md border border-[hsl(var(--border))] bg-transparent px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
        >
          Reschedule
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4"
      data-testid="reschedule-form"
    >
      <div className="mb-3 text-sm">
        Pick a new date and time (local time in <strong>{timezone}</strong>).
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs">
          <span className="mb-1">New start</span>
          <input
            type="datetime-local"
            value={datetimeLocal}
            onChange={(e) => setDatetimeLocal(e.target.value)}
            data-testid="reschedule-datetime"
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm text-[hsl(var(--foreground))]"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          data-testid="reschedule-submit"
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
        >
          {isPending ? 'Rescheduling…' : 'Reschedule'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setMessage(null);
          }}
          disabled={isPending}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
      {message && (
        <p
          data-testid="reschedule-message"
          role="status"
          className="mt-2 text-sm text-[hsl(var(--muted-foreground))]"
        >
          {message}
        </p>
      )}
    </div>
  );
}
