import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `services` table — the price-list entries shown on the public landing page.
 *
 * Phase 2 introduces this table (migration 0002_services.sql). Phase 3 adds
 * the admin CMS for CRUD management.
 *
 * `price_cents` is nullable for "TBD" services (e.g. snow removal).
 * `price_suffix` is e.g. '+' for variable-price jobs, '' for fixed.
 * `active` uses INTEGER 0/1 (SQLite has no native BOOLEAN).
 */
export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  priceCents: integer('price_cents'), // nullable — NULL = "Contact for pricing"
  priceSuffix: text('price_suffix').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active').notNull().default(1),
});

export type ServiceRow = typeof services.$inferSelect;
export type NewServiceRow = typeof services.$inferInsert;
