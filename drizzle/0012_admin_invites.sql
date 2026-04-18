-- Phase 1C — Admin invite-link onboarding (issue #83).
--
-- Adds the `admin_invites` table that backs the new founding-admin +
-- invite-based onboarding model. Replaces the env-driven onboarding scheme
-- that was retired in the same change:
--
--   * The first person to visit /admin/login on a fresh deploy claims the
--     founding admin slot (empty-admins-table guard inside a transaction).
--   * Existing admins invite others by creating rows in this table. Invites
--     are single-use, email-bound, and expire 24 hours after creation.
--
-- Notes:
--   * `token` is a random UUID (v4) — URL-safe, sufficient entropy, never
--     reused. Enforced UNIQUE so a collision on insert fails loudly.
--   * `invited_email` is stored lowercased + trimmed; the server action that
--     accepts an invite compares the submitted email against this value
--     case-insensitively, then writes the final `admins.email` as lowercase.
--   * `expires_at` is written as the ISO-8601 string of `created_at + 24h`
--     at insert time. The application decides "expired" via `expires_at < now()`
--     — no DB-level trigger required.
--   * `used_at` / `used_by_admin_id` are NULL until accept, then set together.
--   * `revoked_at` is NULL until an admin clicks "Revoke" in the UI (or the
--     CLI runs `admin:revoke-invite`).
--   * `created_by_admin_id` is a hard FK — the invite cannot outlive the
--     admin that issued it at audit time. Not ON DELETE CASCADE because our
--     policy is "never delete admins, only soft-disable."
--   * Derived status (`pending` / `used` / `expired` / `revoked`) is computed
--     at read time (no column). Precedence, highest to lowest:
--       revoked  →  used  →  expired  →  pending
--     so an invite that was both used and then (somehow) revoked still shows
--     as revoked.
--
-- This migration is purely additive: no existing table is modified, no data
-- is backfilled. Rows already in `admins` continue to work unchanged.

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

-- Index on `invited_email` so the settings page can cheaply ask "do I
-- already have an invite out for this email?" before creating a new one.
CREATE INDEX `admin_invites_email_idx` ON `admin_invites`(`invited_email`);
