import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { getCustomerFullDetail } from '@/features/customers/queries';
import { formatUSPhone } from '@/lib/formatters/phone';
import { formatStatus } from '@/lib/format-status';
import { NotesEditor } from './_components/NotesEditor';
import { ReviewRequestButton } from './_components/ReviewRequestButton';

/**
 * Admin INDEX book — customer detail view (Phase 10).
 *
 * Sections:
 *   - Master info: name, phone, email (display only)
 *   - Admin notes: textarea + save button (client component)
 *   - Address history: sorted by last_used_at DESC
 *   - Bookings: chronological (most recent first)
 *   - Reviews: chronological (most recent first)
 *   - Photos: gallery from review photos
 *   - "Send review request" standalone button (client component)
 */

export const dynamic = 'force-dynamic';

function formatDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', opts ?? {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  completed: 'Completed',
  no_show: 'No-show',
  expired: 'Expired',
  canceled: 'Canceled',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  declined: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
  no_show: 'bg-gray-100 text-gray-800',
  expired: 'bg-gray-100 text-gray-600',
  canceled: 'bg-gray-100 text-gray-600',
};

export default async function AdminIndexBookDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId: raw } = await params;
  const customerId = Number.parseInt(raw, 10);
  if (!Number.isFinite(customerId)) notFound();

  const db = getDb();
  const detail = getCustomerFullDetail(db, customerId);
  if (!detail) notFound();

  const { customer, addresses, bookingRows, reviewRows, photos } = detail;

  // Build a map of reviewId → photos for the gallery section
  const photosByReviewId = new Map<number, typeof photos>();
  for (const p of photos) {
    const list = photosByReviewId.get(p.reviewId) ?? [];
    list.push(p);
    photosByReviewId.set(p.reviewId, list);
  }

  return (
    <div className="space-y-8" data-testid="index-book-detail">
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

      {/* Master info */}
      <header data-testid="customer-master-info">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="customer-name">
          {customer.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-[hsl(var(--muted-foreground))]">
          <span data-testid="customer-phone">{formatUSPhone(customer.phone)}</span>
          {customer.email && (
            <span data-testid="customer-email">{customer.email}</span>
          )}
          <span className="text-xs">
            Customer since {formatDate(customer.createdAt)}
          </span>
        </div>
      </header>

      {/* Admin notes */}
      <section
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        data-testid="notes-section"
      >
        <h2 className="mb-3 text-lg font-semibold">Admin notes</h2>
        <NotesEditor customerId={customer.id} initialNotes={customer.notes ?? null} />
      </section>

      {/* Review request */}
      <section
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        data-testid="review-request-section"
      >
        <h2 className="mb-3 text-lg font-semibold">Review request</h2>
        <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
          Create a standalone review request for this customer.
        </p>
        <ReviewRequestButton customerId={customer.id} />
      </section>

      {/* Address history */}
      <section
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        data-testid="addresses-section"
      >
        <h2 className="mb-3 text-lg font-semibold">Address history</h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No addresses on file.</p>
        ) : (
          <ul className="space-y-2" data-testid="addresses-list">
            {addresses.map((addr) => (
              <li key={addr.id} className="flex items-start justify-between gap-4 text-sm">
                <span data-testid="address-text">{addr.address}</span>
                <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
                  Last used {formatDate(addr.lastUsedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bookings */}
      <section
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        data-testid="bookings-section"
      >
        <h2 className="mb-3 text-lg font-semibold">
          Bookings
          <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">
            ({bookingRows.length})
          </span>
        </h2>
        {bookingRows.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-[hsl(var(--border))] text-sm"
              data-testid="bookings-table"
            >
              <thead>
                <tr>
                  <th className="pb-2 pr-4 text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    Date
                  </th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    Address
                  </th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    Status
                  </th>
                  <th className="pb-2 text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    View
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {bookingRows.map((b) => (
                  <tr key={b.id} data-testid="booking-row" data-booking-id={b.id}>
                    <td className="py-2 pr-4 tabular-nums">{formatDateTime(b.startAt)}</td>
                    <td className="py-2 pr-4 text-[hsl(var(--muted-foreground))]">
                      {b.addressText}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/admin/inbox/${b.id}`}
                        className="text-xs text-[hsl(var(--muted-foreground))] underline hover:text-[hsl(var(--foreground))]"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reviews */}
      <section
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
        data-testid="reviews-section"
      >
        <h2 className="mb-3 text-lg font-semibold">
          Reviews
          <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">
            ({reviewRows.length})
          </span>
        </h2>
        {reviewRows.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No reviews yet.</p>
        ) : (
          <ul className="space-y-3" data-testid="reviews-list">
            {reviewRows.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-md border border-[hsl(var(--border))] p-3 text-sm"
                data-testid="review-row"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {r.status === 'submitted' && r.rating !== null ? (
                      <span
                        className="text-yellow-500"
                        aria-label={`${r.rating} out of 5 stars`}
                      >
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </span>
                    ) : (
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        Pending — not yet submitted
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === 'submitted'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {formatStatus(r.status)}
                    </span>
                  </div>
                  {r.reviewText && (
                    <p className="text-[hsl(var(--muted-foreground))]">{r.reviewText}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-[hsl(var(--muted-foreground))]">
                  {r.status === 'submitted'
                    ? formatDate(r.submittedAt)
                    : `Requested ${formatDate(r.requestedAt)}`}
                  <div className="mt-1">
                    <Link
                      href={`/admin/reviews/${r.id}`}
                      className="text-xs underline hover:text-[hsl(var(--foreground))]"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Photos gallery */}
      {photos.length > 0 && (
        <section
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          data-testid="photos-section"
        >
          <h2 className="mb-3 text-lg font-semibold">
            Photos
            <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">
              ({photos.length})
            </span>
          </h2>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
            data-testid="photos-gallery"
          >
            {photos.map((p) => (
              <a
                key={p.id}
                href={`/uploads/${p.filePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="overflow-hidden rounded-md border border-[hsl(var(--border))]"
              >
                <Image
                  src={`/uploads/${p.filePath}`}
                  alt="Review photo"
                  width={200}
                  height={200}
                  className="h-32 w-full object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
