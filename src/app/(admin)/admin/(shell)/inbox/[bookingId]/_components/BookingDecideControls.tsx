'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptBooking,
  cancelBookingByAdmin,
  declineBooking,
  markCompleted,
  markNoShow,
  type DecideResult,
} from '@/features/bookings/decide';
import type { AdminAction } from '@/features/bookings/state';

/**
 * Admin decide buttons — client component. Renders only the actions listed
 * in `actions` prop (which comes from the state machine on the server). Each
 * button posts the server action with the page-observed `expectedUpdatedAt`
 * so the optimistic-lock check fires if a sibling tab / device raced us.
 *
 * On success, we `router.refresh()` so the server page re-queries and the
 * button set updates to reflect the new status.
 */
export function BookingDecideControls({
  bookingId,
  expectedUpdatedAt,
  actions,
}: {
  bookingId: number;
  expectedUpdatedAt: string;
  actions: readonly AdminAction[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleResult(result: DecideResult, actionLabel: string): void {
    if (result.ok) {
      setMessage(`${actionLabel} succeeded.`);
      router.refresh();
      return;
    }
    if (result.kind === 'conflict') {
      setMessage(
        'Someone else just updated this booking — refresh to see the latest.',
      );
    } else if (result.kind === 'invalid_transition') {
      setMessage(
        `Can't ${actionLabel.toLowerCase()} — the booking is now "${result.currentStatus.replace(
          '_',
          ' ',
        )}".`,
      );
    } else if (result.kind === 'not_found') {
      setMessage('This booking no longer exists.');
    } else {
      setMessage('Something went wrong. Please try again.');
    }
  }

  function run(
    label: string,
    fn: () => Promise<DecideResult>,
    confirmMsg?: string,
  ): void {
    if (confirmMsg && typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      handleResult(result, label);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.includes('accept') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run('Accept', () =>
                acceptBooking(bookingId, expectedUpdatedAt),
              )
            }
            data-testid="action-accept"
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-60"
          >
            Accept
          </button>
        )}
        {actions.includes('decline') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                'Decline',
                () => declineBooking(bookingId, expectedUpdatedAt),
                'Decline this request? This cannot be undone.',
              )
            }
            data-testid="action-decline"
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
          >
            Decline
          </button>
        )}
        {actions.includes('mark_completed') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                'Mark completed',
                () => markCompleted(bookingId, expectedUpdatedAt),
                'Mark this booking completed? This is terminal — no further changes allowed.',
              )
            }
            data-testid="action-mark-completed"
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-60"
          >
            Mark completed
          </button>
        )}
        {actions.includes('mark_no_show') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                'Mark no-show',
                () => markNoShow(bookingId, expectedUpdatedAt),
                'Mark this as a no-show? This is terminal.',
              )
            }
            data-testid="action-mark-no-show"
            className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-500 disabled:opacity-60"
          >
            Mark no-show
          </button>
        )}
        {actions.includes('cancel') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                'Cancel',
                () => cancelBookingByAdmin(bookingId, expectedUpdatedAt),
                'Cancel this confirmed booking?',
              )
            }
            data-testid="action-cancel"
            className="rounded-md border border-red-700 bg-transparent px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950 disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
      {message && (
        <p
          data-testid="action-message"
          role="status"
          className="text-sm text-[hsl(var(--muted-foreground))]"
        >
          {message}
        </p>
      )}
    </div>
  );
}
