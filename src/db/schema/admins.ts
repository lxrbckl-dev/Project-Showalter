import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `admins` — one row per admin. Populated at runtime by the founding-admin
 * flow (empty-table claim). Single-admin install: there's only ever one row.
 *
 * `active` uses INTEGER (0/1) — SQLite has no native BOOLEAN.
 * `enrolled_at` is NULL until the admin registers a passkey.
 *
 * The `email` column was dropped in migration 0025_drop_admin_email when
 * the multi-admin invite system was retired.
 */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Display name shown in the admin shell ("Welcome, Sawyer."). */
  name: text('name'),
  active: integer('active').notNull().default(1),
  enrolledAt: text('enrolled_at'),
  createdAt: text('created_at').notNull(),
});

export type AdminRow = typeof admins.$inferSelect;
export type NewAdminRow = typeof admins.$inferInsert;
