-- Phase 2 migration: create the `services` table.
-- The `SEED_FROM_BRIEF` env var in boot.ts populates it with Sawyer's
-- five services on a fresh DB when the flag is true.

CREATE TABLE `services` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NOT NULL,
    `price_cents` INTEGER,
    `price_suffix` TEXT NOT NULL DEFAULT '',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `active` INTEGER NOT NULL DEFAULT 1
);
