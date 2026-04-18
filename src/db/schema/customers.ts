import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `customers` table — Phase 5.
 *
 * The master customer directory (the "INDEX book" from STACK.md). One row per
 * unique person Sawyer has served. New rows are created by the booking-submit
 * flow when no existing customer matches by phone or email; Phase 6 / Phase 10
 * will add admin-initiated create + edit.
 *
 * Phone is normalized to E.164 (`+1XXXXXXXXXX`) before insert — see
 * `src/lib/formatters/phone.ts`. Email is nullable but unique when present
 * (enforced in SQL via a partial UNIQUE index on the migration — Drizzle's
 * schema-level `unique()` would make NULL columns collide, which we don't want).
 */
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  email: text('email'),
  /** Freeform admin notes on this customer — distinct from booking notes. */
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  /** Set by the booking-submit path to the start_at of the most recent booking. */
  lastBookingAt: text('last_booking_at'),
});

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomerRow = typeof customers.$inferInsert;
