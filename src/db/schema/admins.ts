import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `admins` — one row per admin slot, seeded from `ADMIN_EMAILS` env on boot.
 *
 * `active` uses INTEGER (0/1) — SQLite has no native BOOLEAN.
 * `enrolled_at` is NULL until the admin registers a passkey.
 */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  active: integer('active').notNull().default(1),
  enrolledAt: text('enrolled_at'),
  createdAt: text('created_at').notNull(),
});

export type AdminRow = typeof admins.$inferSelect;
export type NewAdminRow = typeof admins.$inferInsert;
