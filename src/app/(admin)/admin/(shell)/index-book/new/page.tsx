import Link from 'next/link';
import { NewCustomerForm } from './_components/NewCustomerForm';

/**
 * Admin INDEX book — new customer form (Phase 10).
 *
 * Allows admins to manually create a customer record directly, without a
 * booking. The form client component handles submission via the
 * `createCustomerFromAdmin` server action and redirects to the customer's
 * detail page on success (or on dedup match).
 */

export const dynamic = 'force-dynamic';

export default function AdminNewCustomerPage() {
  return (
    <div className="space-y-6" data-testid="new-customer-page">
      {/* Back nav */}
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/admin/index-book"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          data-testid="back-to-index-book"
        >
          &larr; Rolodex
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add customer</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Create a new customer record manually. If a customer with the same
          phone or email already exists, you will be redirected to their profile.
        </p>
      </header>

      <div className="max-w-lg rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <NewCustomerForm />
      </div>
    </div>
  );
}
