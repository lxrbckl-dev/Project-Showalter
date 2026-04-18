-- Add `site_title` to `site_config` so the public-facing business name can
-- be edited from the admin CMS rather than living as a hardcoded string
-- across the codebase.
--
-- Shape:
--   * Stored as TEXT in mixed case (e.g. "Sawyer Showalter Service"). The
--     Hero eyebrow uppercases via Tailwind, so the stored form stays readable
--     for SEO titles, email subjects, and OG cards.
--   * NOT NULL with a default of "Sawyer Showalter Service" — this is the
--     current business name and matches what Alex asked for. Any existing
--     row picks up the default automatically, and no NULL handling is
--     needed at read sites.
--   * Validated 1-60 chars (after trim) in
--     `src/features/site-config/actions.ts`.

ALTER TABLE `site_config` ADD COLUMN `site_title` TEXT NOT NULL DEFAULT 'Sawyer Showalter Service';
