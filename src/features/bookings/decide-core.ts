import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import {
  bookings,
  type BookingRow,
  type BookingStatus,
} from '@/db/schema/bookings';
import type * as schema from '@/db/schema';
import { canTransition } from './state';

/**
 * Pure, testable core for the admin decide actions (accept / decline /
 * markCompleted / markNoShow). Split out of `decide.ts` (the `'use server'`
 * surface) so unit tests can spin up an in-memory SQLite and exercise the
 * state-machine + optimistic-locking predicates without Next.
 */

type Db = BetterSQLite3Database<typeof schema>;

export type DecideResult =
  | { ok: true; booking: BookingRow }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'conflict'; currentStatus: BookingStatus; currentUpdatedAt: string }
  | { ok: false; kind: 'invalid_transition'; currentStatus: BookingStatus };

export interface DecideInput {
  bookingId: number;
  /**
   * The `updated_at` the caller observed on the row when the UI rendered.
   * A mismatch → `conflict` (someone else just edited the row). This is the
   * optimistic-lock predicate described in STACK.md § Concurrency and
   * integrity.
   */
  expectedUpdatedAt: string;
  nextStatus: BookingStatus;
  db: Db;
  now?: Date;
}

/**
 * Apply the next-status transition atomically with the optimistic lock.
 *
 * The UPDATE's WHERE clause carries the `updated_at` predicate — if another
 * writer bumped the row since we read it, zero rows match and we return
 * `conflict` (HTTP 409 from the server action wrapper). We only validate
 * `canTransition` AFTER the UPDATE fails, so the error we surface is the
 * right one: stale data → conflict; fresh data but illegal transition →
 * invalid_transition.
 */
export function decideBookingCore(input: DecideInput): DecideResult {
  const { bookingId, expectedUpdatedAt, nextStatus, db, now = new Date() } = input;

  const current = db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
    .all()[0];
  if (!current) {
    return { ok: false, kind: 'not_found' };
  }

  // Stale read → bail before touching state.
  if (current.updatedAt !== expectedUpdatedAt) {
    return {
      ok: false,
      kind: 'conflict',
      currentStatus: current.status,
      currentUpdatedAt: current.updatedAt,
    };
  }

  // Legal-transition check.
  if (!canTransition(current.status, nextStatus)) {
    return {
      ok: false,
      kind: 'invalid_transition',
      currentStatus: current.status,
    };
  }

  const nowIso = now.toISOString();
  const updated = db
    .update(bookings)
    .set({
      status: nextStatus,
      decidedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        // Belt-and-suspenders: if another writer slipped in between our SELECT
        // and UPDATE (sub-millisecond race), the predicate rejects the write
        // and returning() yields zero rows. Treat that as a conflict too.
        eq(bookings.updatedAt, expectedUpdatedAt),
      ),
    )
    .returning()
    .all();

  if (updated.length === 0) {
    // Race: re-read to surface the latest server state to the caller.
    const latest = db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
      .all()[0];
    return {
      ok: false,
      kind: 'conflict',
      currentStatus: latest?.status ?? current.status,
      currentUpdatedAt: latest?.updatedAt ?? current.updatedAt,
    };
  }

  return { ok: true, booking: updated[0] };
}
