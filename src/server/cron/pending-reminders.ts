/**
 * Pending-booking reminders sweep — Phase 8B.
 *
 * Schedule: every 15 minutes (`*\/15 * * * *`).
 *
 * For each booking with status='pending':
 *   - If created_at + 24h has passed AND no 'pending_reminder_24h' notification
 *     logged for this booking → insert notification + call sendPush
 *   - If created_at + 48h has passed AND no 'pending_reminder_48h' notification
 *     logged for this booking → insert notification + call sendPush
 *
 * Idempotent: the existence check on `notifications` prevents double-fire even
 * if the handler runs multiple times within the same window.
 *
 * Wrapped in `withCronRun` for `cron_runs` bookkeeping.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, inArray } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { withCronRun } from './cron-runs';
import { sendPushToAllAdmins } from '@/server/notifications/push';

type Db = BetterSQLite3Database<typeof schema>;

const TASK = 'reminders_sweep';

const HOURS_24 = 24 * 60 * 60 * 1000;
const HOURS_48 = 48 * 60 * 60 * 1000;

type ReminderKind = 'pending_reminder_24h' | 'pending_reminder_48h';

interface ReminderSpec {
  kind: ReminderKind;
  ageMs: number;
}

const REMINDER_SPECS: ReminderSpec[] = [
  { kind: 'pending_reminder_24h', ageMs: HOURS_24 },
  { kind: 'pending_reminder_48h', ageMs: HOURS_48 },
];

export async function runPendingReminders(db: Db): Promise<void> {
  await withCronRun(db, TASK, async () => {
    const now = Date.now();

    // Load all pending bookings.
    const pendingBookings = db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        customerName: bookings.customerName,
        startAt: bookings.startAt,
      })
      .from(bookings)
      .where(eq(bookings.status, 'pending'))
      .all();

    if (pendingBookings.length === 0) return;

    const bookingIds = pendingBookings.map((b) => b.id);

    // Load all existing reminder notifications for these bookings in one query.
    const existingNotifications = db
      .select({ bookingId: notifications.bookingId, kind: notifications.kind })
      .from(notifications)
      .where(
        and(
          inArray(
            notifications.kind,
            REMINDER_SPECS.map((s) => s.kind),
          ),
          inArray(notifications.bookingId as typeof notifications.bookingId, bookingIds),
        ),
      )
      .all();

    // Build a Set of "bookingId:kind" for O(1) existence checks.
    const sent = new Set(
      existingNotifications.map((n) => `${n.bookingId}:${n.kind}`),
    );

    for (const booking of pendingBookings) {
      const createdAtMs = new Date(booking.createdAt).getTime();

      for (const spec of REMINDER_SPECS) {
        const due = now >= createdAtMs + spec.ageMs;
        const alreadySent = sent.has(`${booking.id}:${spec.kind}`);

        if (due && !alreadySent) {
          // Insert in-app notification.
          db.insert(notifications)
            .values({
              kind: spec.kind,
              payloadJson: JSON.stringify({ bookingId: booking.id }),
              read: 0,
              createdAt: new Date().toISOString(),
              bookingId: booking.id,
            })
            .run();

          // Fire Web Push.
          await sendPushToAllAdmins({
            title: 'Pending booking reminder',
            body: `Booking for ${booking.customerName} on ${booking.startAt} is still pending.`,
            url: '/admin/notifications',
          });

          // Update in-memory set so if there's a 24h + 48h for the same booking
          // in this run, we don't re-check the DB.
          sent.add(`${booking.id}:${spec.kind}`);
        }
      }
    }
  });
}
