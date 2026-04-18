'use client';

import { useState, useTransition } from 'react';
import { requestStandaloneReview } from '@/features/reviews/request';
import {
  composeStandaloneReview,
  type StandaloneComposed,
} from '@/features/reviews/compose-action';

/**
 * Standalone review request button for the INDEX book customer detail — Phase 10.
 *
 * Creates a new standalone review row (booking_id=NULL) for the customer and
 * opens a pre-filled mailto: / sms: link. Mirrors the StandaloneReviewWidget
 * from /admin/inbox but is simplified — the customer is already known.
 *
 * Three states:
 *   idle      → shows "Send review request" button
 *   pending   → shows spinner / loading state
 *   generated → shows email + SMS links (or whichever is available)
 */
interface ReviewRequestButtonProps {
  customerId: number;
}

export function ReviewRequestButton({ customerId }: ReviewRequestButtonProps) {
  const [generated, setGenerated] = useState<StandaloneComposed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      const created = await requestStandaloneReview(customerId);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const composed = await composeStandaloneReview(created.reviewId);
      if (!composed.ok) {
        setError(composed.error);
        return;
      }
      setGenerated(composed.composed);
    });
  }

  function handleReset() {
    setGenerated(null);
    setError(null);
  }

  if (generated) {
    return (
      <div
        className="space-y-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
        data-testid="review-request-generated"
      >
        <p className="text-sm font-medium">
          Review request created for {generated.customerName}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Link: <span className="font-mono text-[hsl(var(--foreground))]">{generated.reviewLink}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {generated.emailHref && (
            <a
              href={generated.emailHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="review-request-email-link"
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Open email
            </a>
          )}
          {generated.smsHref && (
            <a
              href={generated.smsHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="review-request-sms-link"
              className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))]"
            >
              Open SMS
            </a>
          )}
          {!generated.emailHref && !generated.smsHref && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              No email or phone on file — share the link directly.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-[hsl(var(--muted-foreground))] underline hover:text-[hsl(var(--foreground))]"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div data-testid="review-request-button-container">
      {error && (
        <p
          className="mb-2 text-sm text-red-500"
          data-testid="review-request-error"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleRequest}
        disabled={isPending}
        data-testid="review-request-button"
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))] disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Send review request'}
      </button>
    </div>
  );
}
