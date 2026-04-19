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
import { withCronRun } from './cron-runs';

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

      // No notification or push fan-out by design — Sawyer scoped the
      // notification system to "new pending bookings I haven't looked at",
      // so an auto-expiry doesn't surface anywhere. The state change above
      // is enough; the row is now in the `expired` terminal state and shows
      // up under the inbox filter naturally.
    }
  });
}
