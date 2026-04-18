-- Phase 5 migration — Booking flow + customer directory foundation.
--
-- Creates five tables and the partial UNIQUE index that enforces the
-- start-time hold at the storage layer per STACK.md § "Concurrency and
-- integrity":
--
--   1. `customers`              — master customer directory (INDEX book seed)
--   2. `customer_addresses`     — every address a customer has used
--   3. `bookings`               — the core booking row (token, status, start_at)
--   4. `booking_attachments`    — customer-attached photos at submission time
--   5. `notifications`          — Sawyer's in-app inbox (Phase 6 extends the UI;
--                                 Phase 5 only inserts rows on cancel)
--
-- Conventions:
--   - Timestamps are TEXT (ISO 8601).
--   - Phones are stored as E.164 strings (e.g. '+19133097340').
--   - SQLite has no BOOLEAN — INTEGER 0/1 stand in (notifications.read).
--   - No cascading deletes; all "removal" flows through status transitions.
--
-- The partial UNIQUE index at the bottom of this file is the key integrity
-- defense: even if two customers race to INSERT for the exact same
-- `start_at`, only one row survives when both are held (status pending or
-- accepted). When a booking transitions to declined / expired / canceled /
-- completed / no_show, its row drops out of the index and the slot is
-- re-bookable.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE `customers` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `name` TEXT NOT NULL,
    `phone` TEXT NOT NULL UNIQUE,
    `email` TEXT,
    `notes` TEXT,
    `created_at` TEXT NOT NULL,
    `updated_at` TEXT NOT NULL,
    `last_booking_at` TEXT
);

-- Email is nullable but unique when non-NULL (SQLite treats NULLs as distinct
-- in UNIQUE indexes, so a straightforward UNIQUE index gives us exactly the
-- "nullable-unique" behavior described in STACK.md).
CREATE UNIQUE INDEX `customers_email_unique`
    ON `customers`(`email`)
    WHERE `email` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- customer_addresses
-- ---------------------------------------------------------------------------
CREATE TABLE `customer_addresses` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `customer_id` INTEGER NOT NULL REFERENCES `customers`(`id`),
    `address` TEXT NOT NULL,
    `created_at` TEXT NOT NULL,
    `last_used_at` TEXT NOT NULL
);

CREATE INDEX `customer_addresses_customer_idx`
    ON `customer_addresses`(`customer_id`);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
CREATE TABLE `bookings` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `token` TEXT NOT NULL UNIQUE,
    `customer_id` INTEGER NOT NULL REFERENCES `customers`(`id`),
    `address_id` INTEGER NOT NULL REFERENCES `customer_addresses`(`id`),
    `address_text` TEXT NOT NULL,
    `customer_name` TEXT NOT NULL,
    `customer_phone` TEXT NOT NULL,
    `customer_email` TEXT,
    `service_id` INTEGER NOT NULL REFERENCES `services`(`id`),
    `start_at` TEXT NOT NULL,
    `notes` TEXT,
    `status` TEXT NOT NULL,
    `created_at` TEXT NOT NULL,
    `updated_at` TEXT NOT NULL,
    `decided_at` TEXT
);

-- Admin queries filter by status and sort by start_at — a covering index
-- keeps the "in progress" and "needs attention" queues cheap.
CREATE INDEX `bookings_status_start_idx`
    ON `bookings`(`status`, `start_at`);

CREATE INDEX `bookings_customer_idx`
    ON `bookings`(`customer_id`);

-- The CORE defense against double-booking. Only active holds (pending or
-- accepted) count, so released statuses don't block re-booking the same slot.
CREATE UNIQUE INDEX `bookings_active_start`
    ON `bookings`(`start_at`)
    WHERE `status` IN ('pending', 'accepted');

-- ---------------------------------------------------------------------------
-- booking_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE `booking_attachments` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `booking_id` INTEGER NOT NULL REFERENCES `bookings`(`id`),
    `file_path` TEXT NOT NULL,
    `original_filename` TEXT NOT NULL,
    `mime_type` TEXT NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_at` TEXT NOT NULL
);

CREATE INDEX `booking_attachments_booking_idx`
    ON `booking_attachments`(`booking_id`);

-- ---------------------------------------------------------------------------
-- notifications (Phase 6 extends the admin UI; Phase 5 only inserts on cancel)
-- ---------------------------------------------------------------------------
CREATE TABLE `notifications` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `kind` TEXT NOT NULL,
    `payload_json` TEXT NOT NULL,
    `read` INTEGER NOT NULL DEFAULT 0,
    `created_at` TEXT NOT NULL
);

CREATE INDEX `notifications_read_created_idx`
    ON `notifications`(`read`, `created_at`);
