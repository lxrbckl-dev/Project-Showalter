'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  requestReviewForBooking,
  type RequestResult,
} from '@/features/reviews/request';

/**
 * "Request review" controls — Phase 9.
 *
 * Shown on a booking detail page once the booking is `completed`. Two
 * paths depending on whether a pending review already exists for the
 * booking (the parent server component passes the existing hrefs when
 * one exists):
 *
 *   - Existing pending review: parent component has already rendered
 *     direct mailto / sms buttons (see the detail page). This control
 *     is not rendered in that branch.
 *   - No pending review yet: click "Generate review request" → the
 *     server action inserts a new reviews row with a fresh UUID token
 *     and bounces the page. On next render the parent shows the
 *     mailto/sms buttons.
 *
 * Kept intentionally minimal — all templating logic lives server-side in
 * `composeReviewRequest`.
 */
export function ReviewRequestControls({
  bookingId,
}: {
  bookingId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result: RequestResult = await requestReviewForBooking(bookingId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        data-testid="request-review"
        className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-60"
      >
        {isPending ? 'Generating…' : 'Generate review request'}
      </button>
      {error && (
        <p
          role="alert"
          data-testid="request-review-error"
          className="text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
