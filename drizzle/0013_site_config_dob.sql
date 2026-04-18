-- Add `date_of_birth` to `site_config` so Sawyer's age can be derived at
-- render time rather than hardcoded in the bio copy.
--
-- Shape:
--   * Stored as TEXT in ISO-8601 `YYYY-MM-DD` form. SQLite has no native DATE
--     type and the rest of this schema already uses TEXT for dates (see
--     `admin_invites.expires_at`, `bookings` timestamps, etc.), so staying on
--     TEXT keeps the conventions uniform.
--   * Nullable with no default — a brand-new deploy simply has no DOB set
--     until an admin enters one in Content → Contact. When NULL the `[age]`
--     placeholder in `bio` renders as an empty string (handled in-app, not
--     in the DB).
--
-- The column is additive; the existing row in `site_config` picks up the new
-- column as NULL and nothing else changes.

ALTER TABLE `site_config` ADD COLUMN `date_of_birth` TEXT;
