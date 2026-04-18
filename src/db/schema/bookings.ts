import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `bookings` table — Phase 5.
 *
 * The core booking row. Canonical state machine documented in STACK.md §
 * "Booking flow → Booking state machine":
 *
 *   pending ──▶ accepted ──▶ completed (TERMINAL)
 *      │           │     └──▶ no_show   (TERMINAL)
 *      │           └───────▶ canceled   (slot released)
 *      ├──▶ declined (slot released)
 *      └──▶ expired  (slot released, 72h auto-transition)
 *
 * Invariants:
 *   - `token` is a 128-bit unguessable string (crypto.randomUUID) set at
 *     creation; it's the single capability handed to the customer.
 *   - `start_at` is an ISO 8601 timestamp in UTC.
 *   - `status` is one of the seven strings above. Not a Drizzle enum because
 *     SQLite doesn't have native enum support; the application layer is the
 *     source of truth for the allowed values.
 *   - Denormalized snapshots (`customer_name`, `customer_phone`,
 *     `customer_email`, `address_text`) preserve what the customer typed at
 *     booking time even if the master record is later edited.
 *   - Partial UNIQUE index on `(start_at) WHERE status IN ('pending','accepted')`
 *     is declared in the 0006 migration — it's the storage-layer defense
 *     against millisecond double-booking.
 */

export const BOOKING_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'completed',
  'no_show',
  'expired',
  'canceled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that hold the slot (block other bookings at the same start_at). */
export const ACTIVE_HOLD_STATUSES: readonly BookingStatus[] = ['pending', 'accepted'];

/**
 * Statuses valid for a customer-initiated cancel. STACK.md is explicit that
 * `completed` is TERMINAL — even Sawyer can't undo it.
 */
export const CUSTOMER_CANCELABLE_STATUSES: readonly BookingStatus[] = [
  'pending',
  'accepted',
];

export const bookings = sqliteTable(
  'bookings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull().unique(),
    customerId: integer('customer_id').notNull(),
    addressId: integer('address_id').notNull(),
    /** Snapshot of what the customer typed at booking time. */
    addressText: text('address_text').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerEmail: text('customer_email'),
    serviceId: integer('service_id').notNull(),
    startAt: text('start_at').notNull(),
    notes: text('notes'),
    status: text('status').$type<BookingStatus>().notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** Set when status transitions to accepted / declined / canceled / completed / no_show. */
    decidedAt: text('decided_at'),
  },
  (table) => ({
    statusStartIdx: index('bookings_status_start_idx').on(
      table.status,
      table.startAt,
    ),
    customerIdx: index('bookings_customer_idx').on(table.customerId),
  }),
);

export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;
