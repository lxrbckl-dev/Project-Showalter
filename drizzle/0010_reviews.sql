-- Phase 9 migration — Reviews workflow.
--
-- Adds two tables per STACK.md § Reviews:
--
--   1. `reviews`         — one row per review request. Created in `pending`
--                          state by the admin "Request review" action; the
--                          customer opens `/review/<token>` and submits to
--                          flip the row into `submitted` state.
--   2. `review_photos`   — customer-attached photos on a submitted review.
--                          Files live under /data/uploads/reviews/<review_id>/.
--
-- Integrity rules:
--   - `reviews.token` is a random unguessable 128-bit UUID, `UNIQUE`.
--   - At most one review per specific booking — enforced by a partial UNIQUE
--     index on `booking_id` where NOT NULL. Multiple standalone reviews
--     (booking_id IS NULL) per customer are allowed.
--   - `status` is one of: 'pending' | 'submitted'. Application-enforced;
--     SQLite has no native enum.
--   - `rating` is 1..5 — validated at the application layer (Zod).
--
-- The column `site_photos.source_review_id` was already introduced in Phase
-- 3C's 0005 migration as a plain INTEGER. SQLite does not support retroactive
-- `ALTER TABLE ... ADD CONSTRAINT` for foreign keys, so we document the
-- logical FK here rather than rewriting the table. Auto-publish inserts set
-- this column to the review's `id`; the public gallery query ignores it.

CREATE TABLE `reviews` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `booking_id` INTEGER REFERENCES `bookings`(`id`),
    `customer_id` INTEGER NOT NULL REFERENCES `customers`(`id`),
    `token` TEXT NOT NULL UNIQUE,
    `status` TEXT NOT NULL DEFAULT 'pending',
    `rating` INTEGER,
    `review_text` TEXT,
    `requested_at` TEXT NOT NULL,
    `submitted_at` TEXT
);

-- At most one review per specific booking. NULL booking_id rows (standalone
-- reviews) are excluded from this constraint and can coexist freely.
CREATE UNIQUE INDEX `reviews_booking_unique`
    ON `reviews`(`booking_id`)
    WHERE `booking_id` IS NOT NULL;

-- Admin UI filters by customer / status — one compound index covers both.
CREATE INDEX `reviews_customer_idx`
    ON `reviews`(`customer_id`, `status`);

-- Admin list view sorts by submitted_at desc, filtered to status='submitted'.
-- (Partial index keeps the cost near-zero while `pending` rows dominate.)
CREATE INDEX `reviews_submitted_at_idx`
    ON `reviews`(`submitted_at`)
    WHERE `status` = 'submitted';

CREATE TABLE `review_photos` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `review_id` INTEGER NOT NULL REFERENCES `reviews`(`id`),
    `file_path` TEXT NOT NULL,
    `mime_type` TEXT NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_at` TEXT NOT NULL
);

CREATE INDEX `review_photos_review_idx`
    ON `review_photos`(`review_id`);
