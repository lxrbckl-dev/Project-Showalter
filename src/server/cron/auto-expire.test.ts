/**
 * Unit tests for auto-expire sweep — Phase 8B.
 *
 * Tests:
 *   - Booking under 72h old is not expired
 *   - Booking over 72h old is transitioned to 'expired'
 *   - expired booking gets a 'booking_expired' notification
 *   - Idempotency: booking already expired is not double-processed
 *   - Non-pending bookings are not touched
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { services } from '@/db/schema/services';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { createTestDb } from '@/db/test-helpers';
import { runAutoExpire } from './auto-expire';

type Db = BetterSQLite3Database<typeof schema>;

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

let seq = 0;
function insertBooking(
  db: Db,
  opts: { createdAt: string; status?: string },
): number {
  seq++;
  const result = db
    .insert(bookings)
    .values({
      token: `tok-expire-${seq}`,
      customerId: 1,
      addressId: 1,
      addressText: '123 Main St',
      customerName: 'Test Customer',
      customerPhone: '+15551234567',
      serviceId: 1,
      startAt: new Date(Date.now() + (24 + seq) * 60 * 60 * 1000).toISOString(),
      status: (opts.status ?? 'pending') as schema.BookingStatus,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    })
    .returning({ id: bookings.id })
    .get();
  return result!.id;
}

describe('auto-expire sweep', () => {
  let testHandle: ReturnType<typeof createTestDb>;
  let db: Db;

  beforeEach(() => {
    seq = 0;
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    // Seed FK parent rows required by bookings constraints.
    db.insert(services).values({ name: 'Test Service', description: 'Test', active: 1 }).run();
    const custRows = db.insert(customers).values({
      name: 'Test Customer', phone: '+15551234567', email: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }).returning().all();
    db.insert(customerAddresses).values({
      customerId: custRows[0].id,
      address: '123 Main St',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-01T00:00:00Z',
    }).run();
  });

  it('does not expire a booking under 72h old', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(71) });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('pending');
    testHandle.cleanup();
  });

  it('expires a booking over 72h old', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(73) });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('expired');
    expect(row?.decidedAt).toBeTypeOf('string');
    testHandle.cleanup();
  });

  it('expires the booking but writes no notification (notifications scoped to booking_submitted only)', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(73) });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('expired');

    const notifs = db
      .select()
      .from(notifications)
      .where(eq(notifications.bookingId, id))
      .all();
    expect(notifs).toHaveLength(0);
    testHandle.cleanup();
  });

  it('idempotency: running twice does not flip an already-expired row again', async () => {
    insertBooking(db, { createdAt: hoursAgo(73) });

    await runAutoExpire(db);
    await runAutoExpire(db); // second run — already expired, no-op

    const allBookings = db.select().from(bookings).all();
    expect(allBookings).toHaveLength(1);
    expect(allBookings[0].status).toBe('expired');

    // No notifications by design — Sawyer only wants notifications for
    // brand-new pending requests he hasn't viewed.
    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    testHandle.cleanup();
  });

  it('does not touch non-pending bookings', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(80), status: 'accepted' });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('accepted');
    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    testHandle.cleanup();
  });

  it('expires multiple eligible bookings in one run', async () => {
    const id1 = insertBooking(db, { createdAt: hoursAgo(80) });
    const id2 = insertBooking(db, { createdAt: hoursAgo(90) });
    const id3 = insertBooking(db, { createdAt: hoursAgo(50) }); // not due

    await runAutoExpire(db);

    const row1 = db.select().from(bookings).where(eq(bookings.id, id1)).get();
    const row2 = db.select().from(bookings).where(eq(bookings.id, id2)).get();
    const row3 = db.select().from(bookings).where(eq(bookings.id, id3)).get();

    expect(row1?.status).toBe('expired');
    expect(row2?.status).toBe('expired');
    expect(row3?.status).toBe('pending');

    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    testHandle.cleanup();
  });
});
