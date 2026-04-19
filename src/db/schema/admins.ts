import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `admins` — one row per admin. Populated at runtime by the founding-admin
 * flow (empty-table claim) and by invite acceptance (#83). No env seeding.
 *
 * `active` uses INTEGER (0/1) — SQLite has no native BOOLEAN.
 * `enrolled_at` is NULL until the admin registers a passkey; under the new
 * model both code paths set it at insert time, but the column stays
 * nullable for backward compatibility with pre-#83 pending rows.
 */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  /**
   * Display name shown in the admin shell ("Welcome, Sawyer."). Required for
   * accounts created from the founding-admin and invite-accept flows; the
   * column itself is nullable so pre-existing rows from before migration
   * `0021_admins_name` continue to satisfy the schema (their welcome banner
   * falls back to email).
   */
  name: text('name'),
  active: integer('active').notNull().default(1),
  enrolledAt: text('enrolled_at'),
  createdAt: text('created_at').notNull(),
});

export type AdminRow = typeof admins.$inferSelect;
export type NewAdminRow = typeof admins.$inferInsert;
