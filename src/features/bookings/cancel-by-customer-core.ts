import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  bookings,
  CUSTOMER_CANCELABLE_STATUSES,
  type BookingStatus,
} from '@/db/schema/bookings';
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

  const nowIso = now.toISOString();
  db.update(bookings)
    .set({
      status: 'canceled',
      decidedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(bookings.id, row.id))
    .run();

  // No in-app notification by design — Sawyer scoped notifications to
  // "new pending bookings I haven't looked at" only. The cancel still
  // flips the row to `canceled` (above) so it shows up in inbox lists.
  return { ok: true };
}
