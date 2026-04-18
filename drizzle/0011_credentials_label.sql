-- Phase 1B+ — multi-device passkey management (issue #77).
--
-- Two related changes shipped together so the devices feature can land in one
-- PR with a single migration slot.
--
-- 1. Add a user-friendly `label` column to `credentials` so an admin can
--    name their devices ("iPhone 15", "Work laptop", etc.).
--
-- 2. Add `credential_id` to the `session` table so we can track which passkey
--    was used for a given session. This makes two things trivial:
--      - identifying the "current device" row in the devices management UI
--      - invalidating exactly-the-right sessions when a credential is removed
--        (so a stolen device can't continue to operate with its 30-day cookie
--        after it's been removed from the admin's device list)
--
--    The session-table column is nullable because existing session rows have
--    no record of which credential they came from. On removal we `IS NULL`-
--    preserve those rows (they can't be associated with a revoked credential
--    anyway); fresh sessions (post-migration) always carry a credential_id.
--
--    Column name is `credentialId` (camelCase) to stay consistent with the
--    Auth.js adapter naming used elsewhere in the `session` table (`sessionToken`,
--    `userId`, `expires`). Drizzle maps our `credentialId` TS field to this
--    same column name.

ALTER TABLE `credentials` ADD COLUMN `label` TEXT;

ALTER TABLE `session` ADD COLUMN `credentialId` TEXT;
