-- Phase 1A — Auth foundation migration.
-- Creates the admins, credentials, and recovery_codes tables.
--
-- SQLite has no native BOOLEAN; active and counter use INTEGER.
-- All timestamps are TEXT stored as ISO-8601 strings (consistent with 0000).

CREATE TABLE `admins` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `email` TEXT UNIQUE NOT NULL,
    `active` INTEGER NOT NULL DEFAULT 1,
    `enrolled_at` TEXT,
    `created_at` TEXT NOT NULL
);

CREATE TABLE `credentials` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `admin_id` INTEGER NOT NULL REFERENCES admins(`id`),
    `credential_id` TEXT UNIQUE NOT NULL,
    `public_key` TEXT NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `device_type` TEXT,
    `created_at` TEXT NOT NULL
);

CREATE TABLE `recovery_codes` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `admin_id` INTEGER NOT NULL REFERENCES admins(`id`),
    `code_hash` TEXT NOT NULL,
    `used_at` TEXT,
    `created_at` TEXT NOT NULL
);

-- Exactly one active (unused) recovery code per admin.
CREATE UNIQUE INDEX recovery_codes_active ON recovery_codes(admin_id) WHERE used_at IS NULL;
