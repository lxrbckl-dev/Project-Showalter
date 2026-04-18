-- Phase 6 migration — Admin booking management.
--
-- Two additive changes (both nullable FKs) to support the admin inbox UI:
--
--   1. `bookings.rescheduled_to_id` — points from an old (canceled-via-reschedule)
--      booking to its replacement. Enables the `/bookings/<old-token>` customer
--      page to render a "rescheduled to …" pointer link to the new booking's
--      token without needing a separate lookup table. Nullable because the vast
--      majority of bookings are not reschedules.
--
--   2. `notifications.booking_id` — Phase 5's cancel-by-customer insert stored
--      the booking ID inside `payload_json`. Promoting it to a real column lets
--      the admin inbox UI do a cheap JOIN instead of parsing JSON per row, and
--      makes "notifications that reference this booking" queryable by index.
--      Existing Phase 5 rows stay at `NULL` — the UI gracefully falls back to
--      the payload when the column is missing. Going forward, Phase 5's cancel
--      action also populates the column (see `cancel-by-customer-core.ts`).
--
-- Both are nullable + additive — no backfill required, no risk to existing rows.

-- ---------------------------------------------------------------------------
-- bookings.rescheduled_to_id — forward pointer for reschedules
-- ---------------------------------------------------------------------------
ALTER TABLE `bookings`
    ADD COLUMN `rescheduled_to_id` INTEGER REFERENCES `bookings`(`id`);

-- Index helps the (rare) reverse-lookup "what booking did I replace" query
-- surface cleanly from the admin detail page. Small table + rare reschedules,
-- so cost is negligible.
CREATE INDEX `bookings_rescheduled_to_idx`
    ON `bookings`(`rescheduled_to_id`);

-- ---------------------------------------------------------------------------
-- notifications.booking_id — optional FK for booking-scoped notifications
-- ---------------------------------------------------------------------------
ALTER TABLE `notifications`
    ADD COLUMN `booking_id` INTEGER REFERENCES `bookings`(`id`);

CREATE INDEX `notifications_booking_idx`
    ON `notifications`(`booking_id`);
