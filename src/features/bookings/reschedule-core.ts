import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { bookings, type BookingRow } from '@/db/schema/bookings';
import type * as schema from '@/db/schema';
import { canTransition } from './state';

/**
 * Reschedule core — Phase 6.
 *
 * STACK.md § Reschedule flow is explicit: rescheduling is **cancel-old +
 * create-new**, not in-place edit. That keeps the state machine simple and
 * the audit trail intact. We run both writes in a single transaction so a
 * partial failure rolls back entirely.
 *
 * Ordering inside the transaction:
 *   1. Cancel the old booking (status → canceled, decided_at set).
 *      This releases the old row from `bookings_active_start` so the new
 *      booking's start_at can reuse the same slot if Sawyer is moving it by
 *      just a few minutes (or even back to the same time).
 *   2. Insert the new booking. Status = 'accepted' because this path is
 *      admin-only — Sawyer is moving an already-confirmed appointment.
 *   3. Stamp `bookings.rescheduled_to_id = <new id>` on the old row so
 *      `/bookings/<old-token>` can render the "rescheduled to …" pointer.
 *
 * The new booking inherits the old one's customer_id, address_id,
 * address_text, service_id, and notes. The customer_name / customer_phone /
 * customer_email snapshots are carried forward too — they're historical
 * captures from the original submission, and the reschedule is a scheduling
 * change, not a customer-info change.
 */

type Db = BetterSQLite3Database<typeof schema>;

export type RescheduleResult =
  | { ok: true; newBooking: BookingRow; oldBooking: BookingRow }
  | { ok: false; kind: 'not_found' }
  | {
      ok: false;
      kind: 'conflict';
      currentStatus: BookingRow['status'];
      currentUpdatedAt: string;
    }
  | { ok: false; kind: 'invalid_transition'; currentStatus: BookingRow['status'] }
  | { ok: false; kind: 'slot_taken' }
  | { ok: false; kind: 'invalid_start_at'; message: string };

export interface RescheduleInput {
  oldBookingId: number;
  expectedUpdatedAt: string;
  /** ISO 8601 UTC timestamp of the new slot. */
  newStartAt: string;
  db: Db;
  now?: Date;
  /** Token generator — overridable in tests. */
  generateToken?: () => string;
}

export function rescheduleBookingCore(
  input: RescheduleInput,
): RescheduleResult {
  const {
    oldBookingId,
    expectedUpdatedAt,
    newStartAt,
    db,
    now = new Date(),
    generateToken = () => crypto.randomUUID(),
  } = input;

  // Basic ISO-shape check so we fail cleanly before starting a transaction.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(newStartAt)) {
    return {
      ok: false,
      kind: 'invalid_start_at',
      message: 'Expected an ISO 8601 UTC timestamp.',
    };
  }

  const current = db
    .select()
    .from(bookings)
    .where(eq(bookings.id, oldBookingId))
    .limit(1)
    .all()[0];
  if (!current) {
    return { ok: false, kind: 'not_found' };
  }
  if (current.updatedAt !== expectedUpdatedAt) {
    return {
      ok: false,
      kind: 'conflict',
      currentStatus: current.status,
      currentUpdatedAt: current.updatedAt,
    };
  }
  if (!canTransition(current.status, 'canceled')) {
    return {
      ok: false,
      kind: 'invalid_transition',
      currentStatus: current.status,
    };
  }

  const nowIso = now.toISOString();
  const newToken = generateToken();

  try {
    const { newBooking, oldBooking } = db.transaction((tx) => {
      // Step 1: cancel the old row with the lock predicate re-applied inside
      // the tx. Releases the old start_at's active hold.
      const canceledRows = tx
        .update(bookings)
        .set({
          status: 'canceled',
          decidedAt: nowIso,
          updatedAt: nowIso,
        })
        .where(eq(bookings.id, oldBookingId))
        .returning()
        .all();
      const canceled = canceledRows[0];

      // Step 2: insert the new booking. If the partial UNIQUE index rejects
      // (another row already holds this slot), the catch below maps to
      // 'slot_taken' and the whole tx rolls back — including the cancel.
      const newRows = tx
        .insert(bookings)
        .values({
          token: newToken,
          customerId: current.customerId,
          addressId: current.addressId,
          addressText: current.addressText,
          customerName: current.customerName,
          customerPhone: current.customerPhone,
          customerEmail: current.customerEmail,
          serviceId: current.serviceId,
          startAt: newStartAt,
          notes: current.notes,
          status: 'accepted',
          createdAt: nowIso,
          updatedAt: nowIso,
          decidedAt: nowIso,
        })
        .returning()
        .all();
      const fresh = newRows[0];

      // Step 3: stamp the old row with the forward pointer so the public
      // page can render "rescheduled to …".
      tx.update(bookings)
        .set({ rescheduledToId: fresh.id, updatedAt: nowIso })
        .where(eq(bookings.id, canceled.id))
        .run();

      // Re-read the old row so callers get the fully-updated shape.
      const finalOld = tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, canceled.id))
        .limit(1)
        .all()[0]!;
      return { newBooking: fresh, oldBooking: finalOld };
    });

    return { ok: true, newBooking, oldBooking };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(msg)) {
      return { ok: false, kind: 'slot_taken' };
    }
    throw err;
  }
}
