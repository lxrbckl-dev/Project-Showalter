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
export function CancelButton({
  token,
  ownerFirstName,
}: {
  token: string;
  ownerFirstName?: string | null;
}) {
  const host = ownerFirstName?.trim() || 'Sawyer';
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  function doCancel(): void {
    setError(null);
    startTransition(async () => {
      const result = await cancelByCustomer(token, reason);
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <h2 className="mb-2 text-lg font-semibold text-red-900">Need to cancel?</h2>
        <p className="mb-4 text-sm text-red-800/80">
          No hard feelings — canceling frees the slot for someone else.
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          data-testid="cancel-open"
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Cancel appointment
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-100 p-6">
      <h2 className="mb-2 text-lg font-semibold text-red-900">Are you sure?</h2>
      <p className="mb-4 text-sm text-red-800">
        This will cancel your request. You can always submit a new one.
      </p>
      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium text-red-900">
          Reason (optional)
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={`Letting ${host} know why is helpful but optional.`}
          data-testid="cancel-reason"
          className="w-full rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none"
        />
      </label>
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
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
