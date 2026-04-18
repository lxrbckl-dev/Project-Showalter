'use client';

import { useState, useTransition } from 'react';
import { requestStandaloneReview } from '@/features/reviews/request';
import {
  composeStandaloneReview,
  type StandaloneComposed,
} from '@/features/reviews/compose-action';

/**
 * Standalone review widget — Phase 9.
 *
 * Sits at the top of /admin/inbox. Sawyer picks an existing customer by
 * typing a name / phone / email — hitting the search server action returns
 * matches, he clicks one, we generate a standalone (booking_id=NULL) review
 * row + expose mailto/sms hrefs for the prefilled message.
 *
 * The widget keeps UI state in React; all data-fetching calls go through
 * server actions (no API route). Three states:
 *   1. idle          — just the search input
 *   2. matches       — list of customers matching the query
 *   3. generated     — mailto/sms links for the new review
 */
export function StandaloneReviewWidget() {
  const [q, setQ] = useState('');
  const [isPending, startTransition] = useTransition();
  const [matches, setMatches] = useState<
    { id: number; name: string; phone: string; email: string | null }[]
  >([]);
  const [generated, setGenerated] = useState<StandaloneComposed | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSearch(): void {
    setError(null);
    setGenerated(null);
    startTransition(async () => {
      const result = await searchCustomersAction(q);
      if (result.ok) {
        setMatches(result.matches);
      } else {
        setError(result.error);
      }
    });
  }

  function handlePick(customerId: number): void {
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

  function handleReset(): void {
    setQ('');
    setMatches([]);
    setGenerated(null);
    setError(null);
  }

  return (
    <section
      className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
      data-testid="standalone-review-widget"
    >
      <h2 className="mb-2 text-sm font-semibold">
        Send a standalone review request
      </h2>
      <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
        For customers you served before this app existed — pick them from the
        INDEX book.
      </p>

      {!generated && (
        <div className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Search name, phone, email…"
            data-testid="standalone-review-search"
            className="flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={isPending || q.trim().length === 0}
            data-testid="standalone-review-search-btn"
            className="rounded-md bg-[hsl(var(--primary))] px-3 py-2 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-60"
          >
            {isPending ? '…' : 'Search'}
          </button>
        </div>
      )}

      {matches.length > 0 && !generated && (
        <ul
          className="mt-3 divide-y divide-[hsl(var(--border))] overflow-hidden rounded-md border border-[hsl(var(--border))]"
          data-testid="standalone-review-matches"
        >
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => handlePick(m.id)}
                disabled={isPending}
                data-testid={`standalone-review-match-${m.id}`}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-[hsl(var(--accent))] disabled:opacity-60"
              >
                <span>
                  <strong>{m.name}</strong>
                  <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {m.phone}
                    {m.email ? ` · ${m.email}` : ''}
                  </span>
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  Request review →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {generated && (
        <div
          className="mt-3 space-y-3"
          data-testid="standalone-review-generated"
        >
          <p className="text-sm">
            Review link generated for{' '}
            <strong>{generated.customerName}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            {generated.emailHref && (
              <a
                href={generated.emailHref}
                data-testid="standalone-review-email"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white"
              >
                Send email request
              </a>
            )}
            {generated.smsHref && (
              <a
                href={generated.smsHref}
                data-testid="standalone-review-sms"
                className="rounded-md bg-green-600 px-3 py-2 text-sm text-white"
              >
                Send text request
              </a>
            )}
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Or share the link manually:{' '}
            <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5">
              {generated.reviewLink}
            </code>
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs underline"
          >
            Send another
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-testid="standalone-review-error"
          className="mt-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}

// Local server-action wrapper to avoid pulling in the full customer-search
// module on the client. Inline definition sits in the sibling file.
import { searchCustomersAction } from './search-customers-action';
