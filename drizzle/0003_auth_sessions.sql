-- Phase 1B migration — Auth.js session tables.
--
-- @auth/drizzle-adapter needs four tables to persist DB-backed sessions:
-- user, account, session, verificationToken. Names/shapes follow the
-- adapter's default schema (camelCase columns on purpose — Auth.js queries
-- those names directly).
--
-- Admin identity lives in `admins` (ticket 1A). `user` is a thin session
-- principal created the first time an admin signs in. The join is by email.

CREATE TABLE IF NOT EXISTS `user` (
    `id` TEXT PRIMARY KEY NOT NULL,
    `name` TEXT,
    `email` TEXT UNIQUE,
    `emailVerified` INTEGER,
    `image` TEXT
);

CREATE TABLE IF NOT EXISTS `account` (
    `userId` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `type` TEXT NOT NULL,
    `provider` TEXT NOT NULL,
    `providerAccountId` TEXT NOT NULL,
    `refresh_token` TEXT,
    `access_token` TEXT,
    `expires_at` INTEGER,
    `token_type` TEXT,
    `scope` TEXT,
    `id_token` TEXT,
    `session_state` TEXT,
    PRIMARY KEY (`provider`, `providerAccountId`)
);

CREATE TABLE IF NOT EXISTS `session` (
    `sessionToken` TEXT PRIMARY KEY NOT NULL,
    `userId` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
    `expires` INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `verificationToken` (
    `identifier` TEXT NOT NULL,
    `token` TEXT NOT NULL,
    `expires` INTEGER NOT NULL,
    PRIMARY KEY (`identifier`, `token`)
);
