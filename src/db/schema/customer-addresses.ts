import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `customer_addresses` table — Phase 5.
 *
 * Every distinct address a customer has used. A customer can have many —
 * Sawyer often mows multiple properties for the same person. Match-or-create
 * logic in `src/features/customers/match.ts` decides whether to reuse a
 * row (and bump `last_used_at`) or insert a new one.
 *
 * There is intentionally no UNIQUE constraint on (customer_id, address) —
 * the match runs with whitespace-normalized / case-insensitive equality in
 * application code, which SQLite's `TEXT UNIQUE` can't capture cleanly. If
 * admins later dedupe manually, a follow-up Phase 10 migration can add
 * `COLLATE NOCASE` + a trigger, but it's not worth the complexity for MVP.
 */
export const customerAddresses = sqliteTable(
  'customer_addresses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    customerId: integer('customer_id').notNull(),
    address: text('address').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
  },
  (table) => ({
    customerIdx: index('customer_addresses_customer_idx').on(table.customerId),
  }),
);

export type CustomerAddressRow = typeof customerAddresses.$inferSelect;
export type NewCustomerAddressRow = typeof customerAddresses.$inferInsert;
