import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  bookings,
  CUSTOMER_CANCELABLE_STATUSES,
  type BookingStatus,
} from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import { notifications } from '@/db/schema/notifications';
import type * as schema from '@/db/schema';

/**
 * Pure, testable cancel-by-customer core — Phase 5.
 *
 * Split from `cancel-by-customer.ts` because Next 15's `'use server'`
 * boundary requires every module-level export to be an async function. The
 * core is synchronous (better-sqlite3 is blocking), and exposing a
 * non-async export alongside the server action trips the compiler. Keeping
 * the core in its own module also makes it trivially unit-testable.
 */

export type CancelResult =
  | { ok: true }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'already_terminal'; status: BookingStatus };

type Db = BetterSQLite3Database<typeof schema>;

export interface CancelByCustomerCore {
  token: string;
  db: Db;
  now?: Date;
}

export function cancelByCustomerCore(
  opts: CancelByCustomerCore,
): CancelResult {
  const { token, db, now = new Date() } = opts;

  const row = db
    .select()
    .from(bookings)
    .where(eq(bookings.token, token))
    .limit(1)
    .all()[0];
  if (!row) {
    return { ok: false, kind: 'not_found' };
  }

  if (!CUSTOMER_CANCELABLE_STATUSES.includes(row.status)) {
    return { ok: false, kind: 'already_terminal', status: row.status };
  }

  const svc = db
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, row.serviceId))
    .limit(1)
    .all()[0];
  const serviceName = svc?.name ?? 'Service';

  const nowIso = now.toISOString();
  db.transaction((tx) => {
    tx.update(bookings)
      .set({
        status: 'canceled',
        decidedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(bookings.id, row.id))
      .run();

    tx.insert(notifications)
      .values({
        kind: 'booking_canceled_by_customer',
        // Promoted in 0007_admin_mgmt.sql — kept in payload as well for
        // backwards compatibility with older rows that predate the column.
        bookingId: row.id,
        payloadJson: JSON.stringify({
          bookingId: row.id,
          token: row.token,
          customerName: row.customerName,
          serviceName,
          startAt: row.startAt,
        }),
        read: 0,
        createdAt: nowIso,
      })
      .run();
  });

  return { ok: true };
}
