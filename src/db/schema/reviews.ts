import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `reviews` table — Phase 9.
 *
 * A review is created in `pending` state at the moment Sawyer taps "Request
 * review" (from the /admin/inbox needs-attention queue or from a customer's
 * detail page for standalone / pre-app reviews). The customer opens
 * `/review/<token>` and submits to flip the row to `submitted`.
 *
 * Invariants:
 *  - `token` is a 128-bit UUID (random, unguessable) set at creation.
 *  - `status` is one of 'pending' | 'submitted' (application-enforced).
 *  - `rating` is 1..5 inclusive when present; always NULL on pending rows,
 *    non-null on submitted rows.
 *  - At most one review per specific `booking_id` (partial UNIQUE in SQL).
 *    Multiple standalone reviews (booking_id IS NULL) per customer are fine
 *    per STACK.md — a customer Sawyer served before the app existed can
 *    have several standalone requests.
 */

export const REVIEW_STATUSES = ['pending', 'submitted'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * NULL for standalone (pre-app) reviews; set to a bookings.id for the
     * normal flow. The partial UNIQUE index on this column (see 0010
     * migration) enforces one review per booking.
     */
    bookingId: integer('booking_id'),
    customerId: integer('customer_id').notNull(),
    token: text('token').notNull().unique(),
    status: text('status').$type<ReviewStatus>().notNull().default('pending'),
    rating: integer('rating'),
    reviewText: text('review_text'),
    requestedAt: text('requested_at').notNull(),
    submittedAt: text('submitted_at'),
  },
  (table) => ({
    customerIdx: index('reviews_customer_idx').on(
      table.customerId,
      table.status,
    ),
  }),
);

export type ReviewRow = typeof reviews.$inferSelect;
export type NewReviewRow = typeof reviews.$inferInsert;
