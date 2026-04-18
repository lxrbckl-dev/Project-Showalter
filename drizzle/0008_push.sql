-- Phase 8A — Web Push subscriptions migration.
--
-- `push_subscriptions` stores one row per device/browser a given admin has
-- subscribed for push. See STACK.md § Notifications for Sawyer — the
-- flagship notification lane is Web Push via VAPID; this table is the
-- persistence layer the dispatcher (src/server/notifications/push.ts) fans
-- out over when delivering a notification.
--
-- Design notes:
--   - `endpoint` is UNIQUE because push-service endpoints are globally
--     distinct per browser install. Re-subscribing the same browser yields
--     the same endpoint URL, which lets us treat re-subscribe as UPSERT.
--   - `p256dh` and `auth` are the client's ECDH public key + auth secret,
--     stored as base64url strings (what `PushSubscription.toJSON()` gives
--     us client-side and what `web-push` accepts server-side).
--   - `user_agent` is captured at subscribe time so the admin UI can show
--     "iPhone (Safari)" / "MacBook (Chrome)" when listing / unsubscribing
--     devices. Free-text, purely cosmetic.
--   - No cascading delete — following the platform's no-destructive-actions
--     principle, subscriptions are removed explicitly by the dispatcher
--     (on 404/410 from the push service) or by the admin UI (unsubscribe).

CREATE TABLE `push_subscriptions` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `admin_id` INTEGER NOT NULL REFERENCES `admins`(`id`),
    `endpoint` TEXT UNIQUE NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `user_agent` TEXT,
    `created_at` TEXT NOT NULL
);

-- Fan-out queries in the dispatcher filter by admin_id; a plain index
-- keeps "all subscriptions for admin N" cheap even with multiple devices.
CREATE INDEX `push_subscriptions_admin_idx`
    ON `push_subscriptions`(`admin_id`);
