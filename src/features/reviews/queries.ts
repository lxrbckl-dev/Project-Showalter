import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { reviews, type ReviewRow } from '@/db/schema/reviews';
import { reviewPhotos, type ReviewPhotoRow } from '@/db/schema/review-photos';
import { customers, type CustomerRow } from '@/db/schema/customers';

/**
 * Server-side reads for the admin /admin/reviews pages — Phase 9.
 *
 * Two surfaces:
 *   - `listReviews(filters)`  : paginated list for the top-level page,
 *                               filterable by customer (LIKE on name/phone/
 *                               email), exact rating, and ISO date range
 *                               on `submitted_at`.
 *   - `getReviewById(id)`     : full detail (review + customer + photos)
 *                               for the /admin/reviews/[id] page.
 *
 * Both surfaces only return `submitted` reviews — `pending` rows exist but
 * they're just "links that haven't been used yet" and don't belong in the
 * customer-review browse UI. (Future: an admin "pending review requests"
 * dashboard could surface the unclosed ones, but it's out of Phase 9.)
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface ReviewListFilters {
  /** Customer free-text search — LIKE on name/phone/email (case-insensitive). */
  q?: string;
  /** Exact rating 1..5. */
  rating?: number;
  /** Inclusive ISO timestamp — reviews submitted on or after this instant. */
  from?: string;
  /** Inclusive ISO timestamp — reviews submitted on or before this instant. */
  to?: string;
  limit?: number;
  offset?: number;
}

export interface ReviewListRow extends ReviewRow {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  photoCount: number;
}

export function listReviews(
  db: Db,
  filters: ReviewListFilters = {},
): ReviewListRow[] {
  const { q, rating, from, to, limit = 50, offset = 0 } = filters;

  const clauses = [eq(reviews.status, 'submitted')];

  if (rating !== undefined && rating >= 1 && rating <= 5) {
    clauses.push(eq(reviews.rating, rating));
  }
  if (from) clauses.push(gte(reviews.submittedAt, from));
  if (to) clauses.push(lte(reviews.submittedAt, to));

  if (q && q.trim().length > 0) {
    const needle = `%${q.trim().toLowerCase()}%`;
    clauses.push(
      // Subquery-based match: return reviews whose customer matches the
      // needle. Using raw SQL keeps the join and filter in one step.
      sql`${reviews.customerId} IN (
        SELECT ${customers.id} FROM ${customers}
        WHERE lower(${customers.name}) LIKE ${needle}
           OR lower(${customers.phone}) LIKE ${needle}
           OR lower(COALESCE(${customers.email}, '')) LIKE ${needle}
      )`,
    );
  }

  const rows = db
    .select()
    .from(reviews)
    .where(and(...clauses))
    .orderBy(desc(reviews.submittedAt))
    .limit(limit)
    .offset(offset)
    .all();

  if (rows.length === 0) return [];

  // Join customers (one query) and photo counts (one query) to avoid N+1.
  const customerIds = Array.from(new Set(rows.map((r) => r.customerId)));
  const customerRowsById = new Map<number, CustomerRow>();
  if (customerIds.length > 0) {
    const cs = db
      .select()
      .from(customers)
      .where(
        sql`${customers.id} IN (${sql.join(
          customerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .all();
    for (const c of cs) customerRowsById.set(c.id, c);
  }

  const reviewIds = rows.map((r) => r.id);
  const photoCounts = new Map<number, number>();
  if (reviewIds.length > 0) {
    const pc = db
      .select({
        reviewId: reviewPhotos.reviewId,
        c: sql<number>`count(*)`,
      })
      .from(reviewPhotos)
      .where(
        sql`${reviewPhotos.reviewId} IN (${sql.join(
          reviewIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .groupBy(reviewPhotos.reviewId)
      .all();
    for (const p of pc) photoCounts.set(p.reviewId, Number(p.c));
  }

  return rows.map((r) => {
    const c = customerRowsById.get(r.customerId);
    return {
      ...r,
      customerName: c?.name ?? null,
      customerPhone: c?.phone ?? null,
      customerEmail: c?.email ?? null,
      photoCount: photoCounts.get(r.id) ?? 0,
    };
  });
}

export interface ReviewDetail extends ReviewRow {
  customer: CustomerRow | null;
  photos: ReviewPhotoRow[];
}

export function getReviewById(db: Db, id: number): ReviewDetail | null {
  const row = db
    .select()
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1)
    .all()[0];
  if (!row) return null;

  const customer = db
    .select()
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1)
    .all()[0] ?? null;

  const photos = db
    .select()
    .from(reviewPhotos)
    .where(eq(reviewPhotos.reviewId, id))
    .orderBy(asc(reviewPhotos.id))
    .all();

  return { ...row, customer, photos };
}

export interface ReviewByTokenRow extends ReviewRow {
  customerName: string | null;
  photos: ReviewPhotoRow[];
}

/**
 * Resolve a review row by its public token, joining the customer name for
 * the public "Hi {name}" greeting on the /review/<token> page. Returns
 * null when the token is unknown — the page then renders a vague 404
 * (no distinction, to avoid enumeration).
 */
export function getReviewByToken(
  db: Db,
  token: string,
): ReviewByTokenRow | null {
  const row = db
    .select()
    .from(reviews)
    .where(eq(reviews.token, token))
    .limit(1)
    .all()[0];
  if (!row) return null;

  const customer = db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1)
    .all()[0];

  const photos = db
    .select()
    .from(reviewPhotos)
    .where(eq(reviewPhotos.reviewId, row.id))
    .orderBy(asc(reviewPhotos.id))
    .all();

  return {
    ...row,
    customerName: customer?.name ?? null,
    photos,
  };
}

/**
 * Small helper the admin "Request review" flow uses to avoid duplicating a
 * pending row when the same booking is re-requested — returns the existing
 * row if any. (Does not consider standalone reviews — those are always
 * inserted fresh.)
 */
export function findPendingReviewForBooking(
  db: Db,
  bookingId: number,
): ReviewRow | null {
  const row = db
    .select()
    .from(reviews)
    .where(
      and(eq(reviews.bookingId, bookingId), eq(reviews.status, 'pending')),
    )
    .orderBy(desc(reviews.id))
    .limit(1)
    .all()[0];
  return row ?? null;
}

/**
 * Returns the submitted review for this booking, if one exists. Used by the
 * admin booking detail page to suppress the "Generate review request" CTA
 * once the customer has actually submitted — there's a partial UNIQUE on
 * (booking_id) so at most one such row can exist.
 */
export function findSubmittedReviewForBooking(
  db: Db,
  bookingId: number,
): ReviewRow | null {
  const row = db
    .select()
    .from(reviews)
    .where(
      and(eq(reviews.bookingId, bookingId), eq(reviews.status, 'submitted')),
    )
    .limit(1)
    .all()[0];
  return row ?? null;
}
