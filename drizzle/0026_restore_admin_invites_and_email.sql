-- Restore the multi-admin invite system + re-add admins.email.
--
-- Counterpart to 0025_drop_admin_email. That migration retired the
-- multi-admin model to simplify a single-admin install. This one brings it
-- back so the founding admin can issue invite links to additional admins
-- (e.g. Sawyer inviting helpers).
--
-- Admins.email:
--   * Re-added as a NULLABLE UNIQUE TEXT column. It's nullable so the one
--     pre-existing admin row (created during the single-admin era — no
--     email) keeps working after this migration applies without any
--     special-case backfill. New founding-admin enrollments and invite
--     acceptances always set a real email, so in practice only legacy
--     rows carry NULL. SQLite allows multiple NULLs in a UNIQUE column
--     (standard SQL).
--   * ADD COLUMN works directly here because it's nullable. The "rebuild
--     recipe" (table copy → drop → rename) is only required when dropping
--     UNIQUE columns, not adding them.
--
-- Admin_invites:
--   * Re-created with the exact shape from 0012_admin_invites.sql so the
--     Drizzle ORM schema in src/db/schema/admin-invites.ts can be restored
--     verbatim. `token` UNIQUE, `invited_email` indexed for the "already
--     invited?" check on the settings page, FKs point at admins(id) (no
--     ON DELETE CASCADE — the project policy is soft-disable, never hard
--     delete).
--   * Derived status (pending/used/expired/revoked) is computed at read
--     time by `deriveStatus` in features/auth/invites-shared.ts, not
--     stored. Precedence: revoked > used > expired > pending.

ALTER TABLE admins ADD COLUMN email TEXT;
CREATE UNIQUE INDEX admins_email_unique ON admins(email);

CREATE TABLE `admin_invites` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `token` TEXT UNIQUE NOT NULL,
    `invited_email` TEXT NOT NULL,
    `label` TEXT,
    `created_by_admin_id` INTEGER NOT NULL REFERENCES admins(`id`),
    `expires_at` TEXT NOT NULL,
    `used_at` TEXT,
    `used_by_admin_id` INTEGER REFERENCES admins(`id`),
    `revoked_at` TEXT,
    `created_at` TEXT NOT NULL
);

CREATE INDEX `admin_invites_email_idx` ON `admin_invites`(`invited_email`);
