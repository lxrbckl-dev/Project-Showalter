import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

/**
 * `admin_invites` — single-use, email-bound, 24-hour expiring invite links.
 *
 * Issued by an enrolled admin from `/admin/settings/admins` and consumed by
 * the invitee at `/admin/signup?token=<token>`. Replaces the old env-seeded
 * pending-admin rows.
 *
 * Derived status is NOT a column — the server computes it at read time
 * from `revoked_at`, `used_at`, and `expires_at` (see `deriveStatus` in
 * `src/features/auth/invites-shared.ts`).
 *
 * Nullable columns encode mutually-exclusive terminal states:
 *   - `used_at` + `used_by_admin_id` are set together when the invite is
 *     accepted.
 *   - `revoked_at` is set when an admin explicitly revokes.
 */
export const adminInvites = sqliteTable(
  'admin_invites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').unique().notNull(),
    invitedEmail: text('invited_email').notNull(),
    /** Optional friendly label (e.g. "Mom", "Saturday helper") — max 60 chars. */
    label: text('label'),
    createdByAdminId: integer('created_by_admin_id').notNull(),
    /** ISO-8601 — set to created_at + 24h at insert. */
    expiresAt: text('expires_at').notNull(),
    /** ISO-8601 — NULL until the invite is accepted. */
    usedAt: text('used_at'),
    /** Populated together with `usedAt` — points at the new admin row. */
    usedByAdminId: integer('used_by_admin_id'),
    /** ISO-8601 — NULL until the invite is revoked by an admin. */
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    emailIdx: index('admin_invites_email_idx').on(table.invitedEmail),
  }),
);

export type AdminInviteRow = typeof adminInvites.$inferSelect;
export type NewAdminInviteRow = typeof adminInvites.$inferInsert;
