import Link from 'next/link';
import { getDb } from '@/db';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { listReviews } from '@/features/reviews/queries';
import { formatUSPhone } from '@/lib/formatters/phone';

/**
 * Admin reviews list — Phase 9.
 *
 * Search by customer (name / phone / email), filter by exact rating, filter
 * by ISO date range on submitted_at. Paginated 25 per page.
 *
 * Table columns:
 *   submitted_at | customer | rating (stars) | excerpt | photos | view
 *
 * Clicking a row opens `/admin/reviews/[id]` for full detail.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  q?: string;
  rating?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const ratingParsed = Number.parseInt(sp.rating ?? '', 10);
  const rating =
    ratingParsed >= 1 && ratingParsed <= 5 ? ratingParsed : undefined;
  const from = sp.from?.trim() || undefined;
  const to = sp.to?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();
  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  // Fetch one extra to detect "has next page" without a COUNT(*) round-trip.
  const rows = listReviews(db, {
    q,
    rating,
    from,
    to,
    limit: PAGE_SIZE + 1,
    offset,
  });
  const hasNext = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Submitted customer reviews — search, filter, or open a detail view.
          </p>
        </div>
        <Link
          href="/admin/reviews/new"
          data-testid="create-review-link-btn"
          className="shrink-0 rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
        >
          Create review link
        </Link>
      </header>

      <form
        method="get"
        action="/admin/reviews"
        data-testid="reviews-filter-form"
        className="grid grid-cols-1 gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:grid-cols-5"
      >
        <div className="sm:col-span-2">
          <label
            htmlFor="q"
            className="mb-1 block text-xs uppercase text-[hsl(var(--muted-foreground))]"
          >
            Customer
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            data-testid="reviews-filter-q"
            placeholder="name, phone, email"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="rating"
            className="mb-1 block text-xs uppercase text-[hsl(var(--muted-foreground))]"
          >
            Rating
          </label>
          <select
            id="rating"
            name="rating"
            defaultValue={rating ? String(rating) : ''}
            data-testid="reviews-filter-rating"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} star{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="from"
            className="mb-1 block text-xs uppercase text-[hsl(var(--muted-foreground))]"
          >
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ''}
            data-testid="reviews-filter-from"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="to"
            className="mb-1 block text-xs uppercase text-[hsl(var(--muted-foreground))]"
          >
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to ?? ''}
            data-testid="reviews-filter-to"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-5">
          <button
            type="submit"
            data-testid="reviews-filter-apply"
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))]"
          >
            Apply filters
          </button>
          {(q || rating || from || to) && (
            <Link
              href="/admin/reviews"
              className="ml-2 rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm"
              data-testid="reviews-filter-clear"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <section data-testid="reviews-list" data-count={visible.length}>
        {visible.length === 0 ? (
          <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No reviews match those filters yet.
          </p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {visible.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/reviews/${r.id}`}
                  data-testid={`review-row-${r.id}`}
                  data-rating={r.rating}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[hsl(var(--accent))]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {r.customerName ?? 'Unknown customer'}
                      </span>
                      <span
                        className="text-yellow-500"
                        data-testid={`review-stars-${r.id}`}
                        aria-label={`${r.rating ?? 0} out of 5 stars`}
                      >
                        {'★'.repeat(r.rating ?? 0)}
                        {'☆'.repeat(5 - (r.rating ?? 0))}
                      </span>
                      {r.photoCount > 0 && (
                        <span className="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
                          {r.photoCount} photo{r.photoCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      {r.customerPhone
                        ? formatUSPhone(r.customerPhone)
                        : 'no phone'}
                      {' · '}
                      {r.submittedAt ? formatDate(r.submittedAt, tz) : '—'}
                    </div>
                    {r.reviewText && (
                      <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--foreground))]">
                        {r.reviewText}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    View →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between text-sm">
        <span className="text-[hsl(var(--muted-foreground))]">Page {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={pageHref({ q, rating, from, to, page: page - 1 })}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1"
              data-testid="reviews-prev"
            >
              Newer
            </Link>
          )}
          {hasNext && (
            <Link
              href={pageHref({ q, rating, from, to, page: page + 1 })}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1"
              data-testid="reviews-next"
            >
              Older
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function pageHref(opts: {
  q?: string;
  rating?: number;
  from?: string;
  to?: string;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.rating) params.set('rating', String(opts.rating));
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  if (opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/admin/reviews?${qs}` : '/admin/reviews';
}

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}
