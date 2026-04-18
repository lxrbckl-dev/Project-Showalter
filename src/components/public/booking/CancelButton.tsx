'use client';

import { useState, useTransition } from 'react';
import { cancelByCustomer } from '@/features/bookings/cancel-by-customer';

/**
 * Customer-facing cancel button — Phase 5.
 *
 * Confirms before submitting. Calls the `cancelByCustomer` server action,
 * which validates the status precondition on the server. On success, the
 * parent server page re-renders with the canceled status banner via
 * `revalidatePath`.
 */
export function CancelButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function doCancel(): void {
    setError(null);
    startTransition(async () => {
      const result = await cancelByCustomer(token);
      if (!result.ok) {
        if (result.kind === 'not_found') {
          setError('This booking is no longer valid.');
        } else if (result.kind === 'already_terminal') {
          setError(
            `This booking is ${result.status.replace('_', ' ')} and can't be canceled.`,
          );
        }
        return;
      }
      // Full reload so server component reflects status change.
      window.location.reload();
    });
  }

  if (!confirming) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-6">
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <h2 className="mb-2 text-lg font-semibold">Need to cancel?</h2>
        <p className="mb-4 text-sm text-gray-400">
          No hard feelings — canceling frees the slot for someone else.
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          data-testid="cancel-open"
          className="rounded-md border border-red-700 bg-red-950/60 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Cancel appointment
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-700 bg-red-950/60 p-6">
      <h2 className="mb-2 text-lg font-semibold text-red-100">Are you sure?</h2>
      <p className="mb-4 text-sm text-red-200">
        This will cancel your request. You can always submit a new one.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={doCancel}
          disabled={isPending}
          data-testid="cancel-confirm"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-60"
        >
          {isPending ? 'Canceling…' : 'Yes, cancel'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
