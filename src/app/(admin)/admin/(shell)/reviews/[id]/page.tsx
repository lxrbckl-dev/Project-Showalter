import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { getReviewById } from '@/features/reviews/queries';
import { formatUSPhone } from '@/lib/formatters/phone';

/**
 * Admin review detail — Phase 9.
 *
 * Renders the full review text, star rating, customer info, and a grid of
 * any attached photos. Photos are served through the shared /uploads/*
 * route handler; links open the original file in a new tab.
 *
 * This page is read-only in Phase 9. Future phases may add inline text
 * edit, soft-archive toggle, and a cross-reference to any `site_photos`
 * rows that were auto-promoted from this review.
 */

export const dynamic = 'force-dynamic';

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id)) notFound();

  const db = getDb();
  const detail = getReviewById(db, id);
  if (!detail) notFound();

  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  return (
    <div className="space-y-6" data-testid="review-detail">
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/admin/reviews"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          &larr; Reviews
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {detail.customer?.name ?? 'Unknown customer'}
          </h1>
          <p
            className="text-sm text-[hsl(var(--muted-foreground))]"
            data-testid="detail-meta"
          >
            {detail.customer?.phone
              ? formatUSPhone(detail.customer.phone)
              : 'no phone'}
            {detail.customer?.email ? ` · ${detail.customer.email}` : ''}
            {' · '}
            {detail.submittedAt
              ? formatDate(detail.submittedAt, tz)
              : `pending since ${formatDate(detail.requestedAt, tz)}`}
          </p>
        </div>
        <div
          className="text-2xl text-yellow-500"
          aria-label={`${detail.rating ?? 0} out of 5 stars`}
          data-testid="detail-stars"
          data-rating={detail.rating ?? 0}
        >
          {'★'.repeat(detail.rating ?? 0)}
          {'☆'.repeat(5 - (detail.rating ?? 0))}
        </div>
      </header>

      <section className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-3 text-lg font-semibold">Review</h2>
        {detail.reviewText ? (
          <p
            className="whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]"
            data-testid="detail-text"
          >
            {detail.reviewText}
          </p>
        ) : (
          <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
            (No written feedback — rating only.)
          </p>
        )}
      </section>

      {detail.photos.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">
            Photos ({detail.photos.length})
          </h2>
          <div
            className="grid grid-cols-3 gap-3 sm:grid-cols-4"
            data-testid="detail-photos"
          >
            {detail.photos.map((p) => (
              <a
                key={p.id}
                href={`/uploads/${p.filePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border border-[hsl(var(--border))]"
                data-testid={`detail-photo-${p.id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/uploads/${p.filePath}`}
                  alt={`Review photo ${p.id}`}
                  className="h-32 w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-3 text-lg font-semibold">Details</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <DetailRow label="Status" value={detail.status} />
          <DetailRow
            label="Requested"
            value={formatDate(detail.requestedAt, tz)}
          />
          {detail.submittedAt && (
            <DetailRow
              label="Submitted"
              value={formatDate(detail.submittedAt, tz)}
            />
          )}
          <DetailRow
            label="Type"
            value={detail.bookingId ? 'Booking-tied' : 'Standalone'}
          />
          {detail.bookingId && (
            <DetailRow
              label="Booking"
              value={(
                <Link
                  href={`/admin/inbox/${detail.bookingId}`}
                  className="underline"
                >
                  Open booking #{detail.bookingId}
                </Link>
              )}
            />
          )}
          <DetailRow
            label="Customer token URL"
            value={`/review/${detail.token}`}
          />
        </dl>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-[hsl(var(--muted-foreground))]">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}
