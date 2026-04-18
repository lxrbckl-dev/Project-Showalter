-- Phase 3C migration — Site photos table.
--
-- `site_photos` stores the gallery images and (Phase 9) review-auto-promoted
-- photos that appear on the public landing page.
--
-- Columns:
--   id              — surrogate PK
--   file_path       — path relative to /data/uploads (e.g. site/gallery/<uuid>.jpg)
--   caption         — optional display caption
--   sort_order      — controls gallery display order; admin can drag-reorder
--   active          — soft-archive flag (1 = visible, 0 = hidden). No hard deletions.
--   source_review_id — nullable future FK to reviews(id). Will be wired as a
--                      real FK constraint in Phase 9 when the reviews table exists.
--                      For now we just store the INTEGER; see Phase 9 for FK DDL.
--   created_at      — ISO 8601 timestamp set at insert time

CREATE TABLE `site_photos` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `file_path` TEXT NOT NULL,
    `caption` TEXT,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` INTEGER NOT NULL DEFAULT 1,
    `source_review_id` INTEGER,
    `created_at` TEXT NOT NULL
);

-- Most admin queries filter by active=1 and sort by sort_order — one index covers both.
CREATE INDEX `site_photos_active_sort_idx`
    ON `site_photos`(`active`, `sort_order`);
