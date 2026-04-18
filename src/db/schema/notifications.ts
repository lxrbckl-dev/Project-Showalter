import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `notifications` table — Sawyer's in-app inbox.
 *
 * Created in Phase 5 because the customer-cancel action needs to insert a
 * `booking_canceled_by_customer` row. Phase 6 extends the admin UI to read
 * this table (unread-count badge, inbox page). Phase 8 adds Web Push fan-out
 * triggered off the same rows.
 *
 * `payload_json` is a free-form JSON blob — the shape varies per `kind`. The
 * renderer decodes the payload based on the kind, so adding new notification
 * kinds in later phases requires no migration.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Notification kind — e.g. 'booking_submitted', 'booking_canceled_by_customer'. */
    kind: text('kind').notNull(),
    /** Arbitrary JSON-encoded payload. */
    payloadJson: text('payload_json').notNull(),
    /** 0 = unread, 1 = read. */
    read: integer('read').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    readCreatedIdx: index('notifications_read_created_idx').on(
      table.read,
      table.createdAt,
    ),
  }),
);

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
