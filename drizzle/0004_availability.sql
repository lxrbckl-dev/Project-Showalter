-- Phase 4 migration — Availability editor tables.
--
-- Three tables model the availability surface per STACK.md § "Availability model":
--   1. `weekly_template_windows` — recurring weekly pattern (opt-in, empty = closed)
--   2. `availability_overrides`  — one row per date that overrides the template
--   3. `availability_override_windows` — per-date windows used when mode='open'
--
-- All times are TEXT in HH:MM 24-hour format (e.g. '09:00', '17:30').
-- All dates are TEXT in YYYY-MM-DD format.
-- SQLite has no native BOOLEAN; modes are TEXT ('open' | 'closed').

CREATE TABLE `weekly_template_windows` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `start_time` TEXT NOT NULL,
    `end_time` TEXT NOT NULL,
    `note` TEXT
);

-- Most resolver queries fetch all windows for a given day_of_week;
-- an index keeps that cheap once the table grows.
CREATE INDEX `weekly_template_windows_dow_idx`
    ON `weekly_template_windows`(`day_of_week`);

CREATE TABLE `availability_overrides` (
    `date` TEXT PRIMARY KEY NOT NULL,
    `mode` TEXT NOT NULL,
    `note` TEXT,
    `created_at` TEXT NOT NULL
);

CREATE TABLE `availability_override_windows` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `date` TEXT NOT NULL REFERENCES `availability_overrides`(`date`),
    `start_time` TEXT NOT NULL,
    `end_time` TEXT NOT NULL
);

CREATE INDEX `availability_override_windows_date_idx`
    ON `availability_override_windows`(`date`);
