import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { asc, desc, eq, like, or, sql } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import {
  customerAddresses,
  type CustomerAddressRow,
} from '@/db/schema/customer-addresses';
import { customers, type CustomerRow } from '@/db/schema/customers';
import { bookings, type BookingRow } from '@/db/schema/bookings';
import { reviews, type ReviewRow } from '@/db/schema/reviews';
import { reviewPhotos, type ReviewPhotoRow } from '@/db/schema/review-photos';

/**
 * Read-side queries for the customer directory (the INDEX book).
 *
 * Phase 6 surface area:
 *   - `searchCustomers(q)` — powers the admin-create walk-in form's
 *     "pick existing customer" dropdown. SQLite `LIKE` for MVP; swap to
 *     FTS5 later (STACK.md § INDEX book → Admin search).
 *   - `getCustomerById` + `listAddressesForCustomer` — used to hydrate the
 *     selected-customer preview + the "reuse saved address" picker.
 *
 * Phase 10 additions:
 *   - `searchCustomers` extended to support pagination + address LIKE matching
 *   - `getCustomerFullDetail` — master + addresses + bookings + reviews + photos
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface CustomerSearchResult {
  customer: CustomerRow;
  primaryAddress: string | null;
  totalBookings: number;
  lastBookingAt: string | null;
}

/**
 * Search customers by name / phone / email / address.
 *
 * - Empty query returns all customers ordered by `last_booking_at DESC`.
 * - Non-empty query runs LIKE on name, phone, email, and any stored address.
 * - Supports pagination via `limit` + `offset`.
 */
export function searchCustomers(
  db: Db,
  q: string,
  limit = 25,
  offset = 0,
): CustomerSearchResult[] {
  const trimmed = q.trim();

  let rows: CustomerRow[];

  if (trimmed.length === 0) {
    rows = db
      .select()
      .from(customers)
      .orderBy(desc(customers.lastBookingAt))
      .limit(limit)
      .offset(offset)
      .all();
  } else {
    // SQLite's LIKE is case-insensitive for ASCII by default; `lower()` makes
    // the comparison explicit so future non-ASCII names (accented chars) still
    // match the expected key.
    const needle = `%${trimmed.toLowerCase()}%`;

    // Address search requires a sub-select — a customer matches if any of their
    // stored addresses contains the needle.
    rows = db
      .select()
      .from(customers)
      .where(
        or(
          like(sql`lower(${customers.name})`, needle),
          like(sql`lower(${customers.phone})`, needle),
          like(sql`lower(coalesce(${customers.email}, ''))`, needle),
          sql`${customers.id} IN (
            SELECT customer_id FROM customer_addresses
            WHERE lower(address) LIKE ${needle}
          )`,
        ),
      )
      .orderBy(desc(customers.lastBookingAt))
      .limit(limit)
      .offset(offset)
      .all();
  }

  if (rows.length === 0) return [];

  // Booking counts in one query — avoid N+1.
  const customerIds = rows.map((c) => c.id);
  const bookingCounts = new Map<number, number>();
  if (customerIds.length > 0) {
    const bc = db
      .select({
        customerId: bookings.customerId,
        c: sql<number>`count(*)`,
      })
      .from(bookings)
      .where(
        sql`${bookings.customerId} IN (${sql.join(
          customerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .groupBy(bookings.customerId)
      .all();
    for (const row of bc) bookingCounts.set(row.customerId, Number(row.c));
  }

  return rows.map((c) => ({
    customer: c,
    primaryAddress: primaryAddressFor(db, c.id),
    totalBookings: bookingCounts.get(c.id) ?? 0,
    lastBookingAt: c.lastBookingAt ?? null,
  }));
}

function primaryAddressFor(db: Db, customerId: number): string | null {
  const row = db
    .select({ address: customerAddresses.address })
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.lastUsedAt))
    .limit(1)
    .all()[0];
  return row?.address ?? null;
}

export function getCustomerById(
  db: Db,
  id: number,
): CustomerRow | null {
  const row = db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1)
    .all()[0];
  return row ?? null;
}

export function listAddressesForCustomer(
  db: Db,
  customerId: number,
): CustomerAddressRow[] {
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.lastUsedAt), asc(customerAddresses.id))
    .all();
}

// ---------------------------------------------------------------------------
// Phase 10 — full customer detail for the INDEX book detail page
// ---------------------------------------------------------------------------

export interface CustomerFullDetail {
  customer: CustomerRow;
  addresses: CustomerAddressRow[];
  bookingRows: BookingRow[];
  reviewRows: ReviewRow[];
  photos: ReviewPhotoRow[];
}

/**
 * `getCustomerFullDetail` — pulls everything we need for the detail page in
 * three additional queries (addresses + bookings + reviews, plus photos if any
 * reviews have them). Does NOT join across tables server-side — we keep each
 * piece separate so the page can render each section independently.
 */
export function getCustomerFullDetail(
  db: Db,
  customerId: number,
): CustomerFullDetail | null {
  const customer = getCustomerById(db, customerId);
  if (!customer) return null;

  const addresses = db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.lastUsedAt))
    .all();

  const bookingRows = db
    .select()
    .from(bookings)
    .where(eq(bookings.customerId, customerId))
    .orderBy(desc(bookings.startAt))
    .all();

  const reviewRows = db
    .select()
    .from(reviews)
    .where(eq(reviews.customerId, customerId))
    .orderBy(desc(reviews.requestedAt))
    .all();

  // Photos from completed bookings — keyed via review rows.
  // Fetch all review_photos for this customer's reviews.
  let photos: ReviewPhotoRow[] = [];
  if (reviewRows.length > 0) {
    const reviewIds = reviewRows.map((r) => r.id);
    photos = db
      .select()
      .from(reviewPhotos)
      .where(
        sql`${reviewPhotos.reviewId} IN (${sql.join(
          reviewIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .orderBy(desc(reviewPhotos.id))
      .all();
  }

  return { customer, addresses, bookingRows, reviewRows, photos };
}
