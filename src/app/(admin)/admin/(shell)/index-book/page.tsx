import Link from 'next/link';
import { getDb } from '@/db';
import { searchCustomers } from '@/features/customers/queries';
import { formatUSPhone } from '@/lib/formatters/phone';

/**
 * Admin INDEX book — customer directory list view (Phase 10).
 *
 * Search box queries name / phone / email / address via SQL LIKE.
 * Table: name, phone, email, total bookings, last booking date.
 * Click row → navigate to /admin/index-book/[customerId].
 *
 * Paginated at 25 per page; "has next page" detected by fetching 26 rows.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  q?: string;
  page?: string;
}>;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function AdminIndexBookPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();
  const results = searchCustomers(db, q, PAGE_SIZE + 1, offset);
  const hasNext = results.length > PAGE_SIZE;
  const visible = results.slice(0, PAGE_SIZE);

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = hasNext ? page + 1 : null;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/admin/index-book${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6" data-testid="index-book-list">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Index Book</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Customer directory — search by name, phone, email, or address.
          </p>
        </div>
        <Link
          href="/admin/index-book/new"
          data-testid="add-customer-btn"
          className="shrink-0 rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
        >
          Add customer
        </Link>
      </header>

      {/* Search form */}
      <form
        method="get"
        action="/admin/index-book"
        data-testid="index-book-search-form"
        className="flex gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email, address…"
          data-testid="index-book-search-input"
          className="flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        />
        <button
          type="submit"
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))]"
        >
          Search
        </button>
        {q && (
          <Link
            href="/admin/index-book"
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Results table */}
      {visible.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="index-book-empty">
          {q ? `No customers found for "${q}".` : 'No customers yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
          <table
            className="min-w-full divide-y divide-[hsl(var(--border))] text-sm"
            data-testid="index-book-table"
          >
            <thead className="bg-[hsl(var(--card))]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                  Phone
                </th>
                <th className="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                  Email
                </th>
                <th className="px-4 py-3 text-right font-medium text-[hsl(var(--muted-foreground))]">
                  Bookings
                </th>
                <th className="px-4 py-3 text-left font-medium text-[hsl(var(--muted-foreground))]">
                  Last booking
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--background))]">
              {visible.map(({ customer, totalBookings, lastBookingAt }) => (
                <tr
                  key={customer.id}
                  data-testid="index-book-row"
                  data-customer-id={customer.id}
                  className="cursor-pointer hover:bg-[hsl(var(--accent))]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/index-book/${customer.id}`}
                      className="font-medium text-[hsl(var(--foreground))] hover:underline"
                      data-testid="index-book-row-name"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {formatUSPhone(customer.phone)}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {customer.email ?? '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    data-testid="index-book-row-bookings"
                  >
                    {totalBookings}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                    {formatDate(lastBookingAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(prevPage !== null || nextPage !== null) && (
        <div className="flex items-center gap-3 text-sm" data-testid="index-book-pagination">
          {prevPage !== null ? (
            <Link
              href={pageHref(prevPage)}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1 hover:bg-[hsl(var(--accent))]"
            >
              &larr; Previous
            </Link>
          ) : (
            <span className="rounded-md border border-[hsl(var(--border))] px-3 py-1 text-[hsl(var(--muted-foreground))] opacity-40">
              &larr; Previous
            </span>
          )}
          <span className="text-[hsl(var(--muted-foreground))]">Page {page}</span>
          {nextPage !== null ? (
            <Link
              href={pageHref(nextPage)}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1 hover:bg-[hsl(var(--accent))]"
            >
              Next &rarr;
            </Link>
          ) : (
            <span className="rounded-md border border-[hsl(var(--border))] px-3 py-1 text-[hsl(var(--muted-foreground))] opacity-40">
              Next &rarr;
            </span>
          )}
        </div>
      )}
    </div>
  );
}
