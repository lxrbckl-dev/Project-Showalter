import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `push_subscriptions` table — Phase 8A.
 *
 * One row per device Sawyer (or any admin) has subscribed for Web Push.
 * The dispatcher in `src/server/notifications/push.ts` queries this table
 * by `adminId` and fans a notification out to every row.
 *
 * `endpoint` is UNIQUE: re-subscribing the same browser yields the same
 * push-service URL, so we UPSERT on conflict in the subscribe action.
 *
 * When the push service responds 404 or 410 to a delivery attempt, the
 * subscription is gone (browser uninstalled, user revoked perm, endpoint
 * rotated by the vendor) and the dispatcher deletes the row.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** FK → admins.id. Reads from 0001_auth.sql. */
    adminId: integer('admin_id').notNull(),
    /** Push-service endpoint URL, globally unique per browser install. */
    endpoint: text('endpoint').unique().notNull(),
    /** Client ECDH public key, base64url-encoded. */
    p256dh: text('p256dh').notNull(),
    /** Push auth secret, base64url-encoded. */
    auth: text('auth').notNull(),
    /** Free-text UA snapshot at subscribe time; admin UI surfaces it. */
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    adminIdx: index('push_subscriptions_admin_idx').on(table.adminId),
  }),
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
