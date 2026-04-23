import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `admins` — one row per admin.
 *
 * Founding-admin flow (empty-admins-table claim) seeds the first row; all
 * subsequent admins are created via invite acceptance at
 * `/admin/signup?token=...` (issue #83).
 *
 * `active` uses INTEGER (0/1) — SQLite has no native BOOLEAN.
 *
 * `enrolled_at` is NULL until the admin registers a passkey. Under the
 * founding + invite flows both code paths set it at insert time, but the
 * column stays nullable for backward compatibility with pre-#83 pending rows.
 *
 * `email` is nullable (and UNIQUE) specifically so the founding-admin row
 * that existed during the single-admin era (migration 0025) keeps working
 * after 0026 re-adds the column. Newly-founded admins and invite-accepted
 * admins always persist a real email — legacy rows are the only NULL source.
 */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique(),
  /**
   * Display name shown in the admin shell ("Welcome, Sawyer."). Required
   * for accounts created from the founding-admin and invite-accept flows;
   * the column itself is nullable so pre-existing rows from before
   * migration `0021_admins_name` continue to satisfy the schema (their
   * welcome banner falls back to "Admin" or email).
   */
  name: text('name'),
  active: integer('active').notNull().default(1),
  enrolledAt: text('enrolled_at'),
  createdAt: text('created_at').notNull(),
});

export type AdminRow = typeof admins.$inferSelect;
export type NewAdminRow = typeof admins.$inferInsert;
