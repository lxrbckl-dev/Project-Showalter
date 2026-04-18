/**
 * Auto-expire pending bookings sweep — Phase 8B.
 *
 * Schedule: every 15 minutes (`*\/15 * * * *`).
 *
 * For each booking with status='pending' AND created_at + 72h has passed:
 *   1. Set status='expired', decided_at=now
 *   2. Insert in-app notification (kind='booking_expired')
 *   3. Call sendPush
 *
 * Idempotent: after a booking transitions to 'expired' its status is no
 * longer 'pending', so it's excluded from the query on subsequent runs.
 *
 * Wrapped in `withCronRun` for `cron_runs` bookkeeping.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, lt } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { withCronRun } from './cron-runs';
import { sendPushToAllAdmins } from '@/server/notifications/push';

type Db = BetterSQLite3Database<typeof schema>;

const TASK = 'auto_expire_sweep';

const HOURS_72_MS = 72 * 60 * 60 * 1000;

export async function runAutoExpire(db: Db): Promise<void> {
  await withCronRun(db, TASK, async () => {
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - HOURS_72_MS).toISOString();
    const nowIso = now.toISOString();

    // Find pending bookings past the 72-hour threshold.
    const toExpire = db
      .select({
        id: bookings.id,
        customerName: bookings.customerName,
        startAt: bookings.startAt,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, 'pending'),
          lt(bookings.createdAt, expiryThreshold),
        ),
      )
      .all();

    if (toExpire.length === 0) return;

    for (const booking of toExpire) {
      // 1. Transition to 'expired'.
      db.update(bookings)
        .set({
          status: 'expired',
          decidedAt: nowIso,
          updatedAt: nowIso,
        })
        .where(
          and(
            eq(bookings.id, booking.id),
            // Guard: only expire if still pending (concurrent safety).
            eq(bookings.status, 'pending'),
          ),
        )
        .run();

      // 2. Insert in-app notification.
      db.insert(notifications)
        .values({
          kind: 'booking_expired',
          payloadJson: JSON.stringify({ bookingId: booking.id }),
          read: 0,
          createdAt: nowIso,
          bookingId: booking.id,
        })
        .run();

      // 3. Fire Web Push.
      await sendPushToAllAdmins({
        title: 'Booking expired',
        body: `Booking for ${booking.customerName} on ${booking.startAt} expired after 72 hours without a decision.`,
        url: '/admin/notifications',
      });
    }
  });
}
