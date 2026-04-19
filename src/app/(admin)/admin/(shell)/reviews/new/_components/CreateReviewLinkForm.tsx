'use client';

import { useState, useTransition } from 'react';
import { requestStandaloneReview } from '@/features/reviews/request';
import {
  composeStandaloneReview,
  type StandaloneComposed,
} from '@/features/reviews/compose-action';
import { CopyButton } from './CopyButton';

interface CustomerOption {
  id: number;
  name: string;
  phone: string;
}

interface CreateReviewLinkFormProps {
  customers: CustomerOption[];
}

/**
 * Client form for creating a standalone review link — /admin/reviews/new.
 *
 * Three states:
 *   idle      → select a customer + submit
 *   pending   → spinner while server actions run
 *   generated → show the tokenized URL, copy button, email/SMS links
 */
export function CreateReviewLinkForm({ customers }: CreateReviewLinkFormProps) {
  const [customerId, setCustomerId] = useState<string>('');
  const [generated, setGenerated] = useState<StandaloneComposed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = Number.parseInt(customerId, 10);
    if (!Number.isFinite(id) || id <= 0) {
      setError('Please select a customer.');
      return;
    }
    setError(null);

    startTransition(async () => {
      const created = await requestStandaloneReview(id);
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
    setCustomerId('');
  }

  if (generated) {
    return (
      <div
        className="space-y-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        data-testid="create-review-link-generated"
      >
        <h2 className="text-lg font-semibold">Review link created</h2>

        <p className="text-sm">
          Customer:{' '}
          <span className="font-medium" data-testid="generated-customer-name">
            {generated.customerName}
          </span>
        </p>

        {/* URL display + copy */}
        <div className="space-y-1">
          <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">
            Review link
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-2">
            <span
              className="min-w-0 break-all font-mono text-sm"
              data-testid="generated-review-link"
            >
              {generated.reviewLink}
            </span>
            <CopyButton text={generated.reviewLink} />
          </div>
        </div>

        {/* Send via email / SMS */}
        <div className="flex flex-wrap gap-2">
          {generated.emailHref && (
            <a
              href={generated.emailHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="generated-email-link"
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
              data-testid="generated-sms-link"
              className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))]"
            >
              Open SMS
            </a>
          )}
          {!generated.emailHref && !generated.smsHref && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              No email or phone on file — share the link directly.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleReset}
          data-testid="create-another-link"
          className="text-xs text-[hsl(var(--muted-foreground))] underline hover:text-[hsl(var(--foreground))]"
        >
          Create another link
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
      data-testid="create-review-link-form"
    >
      <div className="space-y-1">
        <label
          htmlFor="customer-select"
          className="block text-sm font-medium"
        >
          Customer
        </label>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Select an existing customer to generate a standalone review link.
        </p>

        {customers.length === 0 ? (
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]" data-testid="no-customers-message">
            No customers on file yet. Add a customer first via the{' '}
            <a
              href="/admin/index-book"
              className="underline hover:text-[hsl(var(--foreground))]"
            >
              Rolodex
            </a>
            .
          </p>
        ) : (
          <select
            id="customer-select"
            name="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            data-testid="customer-select"
            className="mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          >
            <option value="">— Select a customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="create-review-link-error"
          className="text-sm text-red-500"
        >
          {error}
        </p>
      )}

      {customers.length > 0 && (
        <button
          type="submit"
          disabled={isPending || !customerId}
          data-testid="create-review-link-submit"
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create review link'}
        </button>
      )}
    </form>
  );
}
