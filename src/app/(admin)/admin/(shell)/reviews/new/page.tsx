import Link from 'next/link';
import { getDb } from '@/db';
import { searchCustomers } from '@/features/customers/queries';
import { CreateReviewLinkForm } from './_components/CreateReviewLinkForm';

/**
 * Create standalone review link — /admin/reviews/new (Phase 9+).
 *
 * Fetches existing customers, renders a customer-picker form. The client
 * component calls `requestStandaloneReview` + `composeStandaloneReview` and
 * displays the resulting tokenized URL with a copy button plus pre-filled
 * email / SMS tap-to-send links.
 */

export const dynamic = 'force-dynamic';

export default async function AdminReviewsNewPage() {
  const db = getDb();
  // Load all customers (up to 500) for the picker dropdown.
  const results = searchCustomers(db, '', 500, 0);
  const customers = results.map((r) => ({
    id: r.customer.id,
    name: r.customer.name,
    phone: r.customer.phone,
  }));

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/reviews"
          className="mb-3 inline-block text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          data-testid="back-to-reviews"
        >
          &larr; Reviews
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Create review link
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Generate a standalone review link to share with any customer via
          email, SMS, or any other channel.
        </p>
      </header>

      <CreateReviewLinkForm customers={customers} />
    </div>
  );
}
