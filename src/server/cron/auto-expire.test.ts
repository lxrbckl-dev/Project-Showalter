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

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { runAutoExpire } from './auto-expire';

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      address_id INTEGER NOT NULL,
      address_text TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      service_id INTEGER NOT NULL,
      start_at TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_at TEXT,
      rescheduled_to_id INTEGER
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      booking_id INTEGER
    );
    CREATE TABLE cron_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      task          TEXT    NOT NULL,
      started_at    TEXT    NOT NULL,
      ended_at      TEXT,
      status        TEXT    NOT NULL DEFAULT 'running',
      error_message TEXT
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

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
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: (opts.status ?? 'pending') as schema.BookingStatus,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    })
    .returning({ id: bookings.id })
    .get();
  return result!.id;
}

describe('auto-expire sweep', () => {
  let sqlite: Database.Database;
  let db: Db;

  beforeEach(() => {
    seq = 0;
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
    vi.mock('@/server/notifications/push', () => ({
      sendPushToAllAdmins: vi.fn().mockResolvedValue({ attempted: 0, delivered: 0, removed: 0, failed: 0 }),
      isPushConfigured: vi.fn().mockReturnValue(false),
    }));
  });

  it('does not expire a booking under 72h old', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(71) });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('pending');
    sqlite.close();
  });

  it('expires a booking over 72h old', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(73) });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('expired');
    expect(row?.decidedAt).toBeTypeOf('string');
    sqlite.close();
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
    sqlite.close();
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
    sqlite.close();
  });

  it('does not touch non-pending bookings', async () => {
    const id = insertBooking(db, { createdAt: hoursAgo(80), status: 'accepted' });

    await runAutoExpire(db);

    const row = db.select().from(bookings).where(eq(bookings.id, id)).get();
    expect(row?.status).toBe('accepted');
    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    sqlite.close();
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
    sqlite.close();
  });
});
