'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { createCustomerFromAdmin } from '@/features/customers/actions';
import type { CreateCustomerResult } from '@/features/customers/actions';

const initialState: CreateCustomerResult | null = null;

export function NewCustomerForm() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prev: CreateCustomerResult | null, formData: FormData) => {
      return createCustomerFromAdmin(formData);
    },
    initialState,
  );

  // On successful creation OR if the customer already exists, redirect to detail page.
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      router.push(`/admin/index-book/${state.customerId}`);
    } else if (state.kind === 'already_exists') {
      router.push(`/admin/index-book/${state.customerId}`);
    }
  }, [state, router]);

  const fieldErrors =
    state && !state.ok && state.kind === 'validation' ? state.fieldErrors : {};

  const globalError =
    state && !state.ok && state.kind === 'internal' ? state.message : null;

  return (
    <form action={formAction} className="space-y-5" data-testid="new-customer-form">
      {/* Name */}
      <div>
        <label
          htmlFor="name"
          className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]"
        >
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Full name"
          data-testid="new-customer-name"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        {fieldErrors.name && (
          <p className="mt-1 text-xs text-red-500" data-testid="new-customer-name-error">
            {fieldErrors.name}
          </p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label
          htmlFor="phone"
          className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]"
        >
          Phone <span className="text-red-500">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="(913) 555-0123"
          data-testid="new-customer-phone"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        {fieldErrors.phone && (
          <p className="mt-1 text-xs text-red-500" data-testid="new-customer-phone-error">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]"
        >
          Email <span className="text-[hsl(var(--muted-foreground))] font-normal text-xs">(optional)</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="customer@example.com"
          data-testid="new-customer-email"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        {fieldErrors.email && (
          <p className="mt-1 text-xs text-red-500" data-testid="new-customer-email-error">
            {fieldErrors.email}
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="mb-1 block text-sm font-medium text-[hsl(var(--foreground))]"
        >
          Notes <span className="text-[hsl(var(--muted-foreground))] font-normal text-xs">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          placeholder="Admin notes about this customer…"
          data-testid="new-customer-notes"
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-y"
        />
        {fieldErrors.notes && (
          <p className="mt-1 text-xs text-red-500" data-testid="new-customer-notes-error">
            {fieldErrors.notes}
          </p>
        )}
      </div>

      {/* Global error */}
      {globalError && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="new-customer-global-error"
        >
          {globalError}
        </p>
      )}

      {/* Already-exists notice (shown briefly before redirect) */}
      {state && !state.ok && state.kind === 'already_exists' && (
        <p
          className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
          data-testid="new-customer-exists-notice"
        >
          {state.message} Redirecting to their profile…
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          data-testid="new-customer-submit"
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Add customer'}
        </button>
        <Link
          href="/admin/index-book"
          className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          data-testid="new-customer-cancel"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
