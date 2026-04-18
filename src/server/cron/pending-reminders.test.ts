/**
 * Unit tests for pending-booking reminders sweep — Phase 8B.
 *
 * Tests:
 *   - No notification fired when booking is less than 24h old
 *   - 24h reminder fired when booking is 25h old and no reminder exists
 *   - 48h reminder fired when booking is 49h old and no reminder exists
 *   - Both 24h and 48h reminders fired when booking is 50h old
 *   - Idempotency: running handler twice doesn't double-fire either reminder
 *   - Booking with status != 'pending' is not processed
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { runPendingReminders } from './pending-reminders';

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

let bookingSeq = 0;
function insertBooking(
  db: Db,
  opts: { createdAt: string; status?: string },
): number {
  bookingSeq++;
  const result = db
    .insert(bookings)
    .values({
      token: `tok-${bookingSeq}`,
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

describe('pending-reminders sweep', () => {
  let sqlite: Database.Database;
  let db: Db;

  beforeEach(() => {
    bookingSeq = 0;
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
    // Stub push module so we don't need VAPID env vars in tests
    vi.mock('@/server/notifications/push', () => ({
      sendPushToAllAdmins: vi.fn().mockResolvedValue({ attempted: 0, delivered: 0, removed: 0, failed: 0 }),
      isPushConfigured: vi.fn().mockReturnValue(false),
    }));
  });

  it('no notification fired when booking is under 24h old', async () => {
    insertBooking(db, { createdAt: hoursAgo(10) });

    await runPendingReminders(db);

    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    sqlite.close();
  });

  it('fires 24h reminder for booking that is 25h old', async () => {
    insertBooking(db, { createdAt: hoursAgo(25) });

    await runPendingReminders(db);

    const notifs = db.select().from(notifications).all();
    const r24 = notifs.filter((n) => n.kind === 'pending_reminder_24h');
    expect(r24).toHaveLength(1);
    // 48h not yet due
    const r48 = notifs.filter((n) => n.kind === 'pending_reminder_48h');
    expect(r48).toHaveLength(0);
    sqlite.close();
  });

  it('fires both 24h and 48h reminders for booking that is 50h old', async () => {
    insertBooking(db, { createdAt: hoursAgo(50) });

    await runPendingReminders(db);

    const notifs = db.select().from(notifications).all();
    expect(notifs.filter((n) => n.kind === 'pending_reminder_24h')).toHaveLength(1);
    expect(notifs.filter((n) => n.kind === 'pending_reminder_48h')).toHaveLength(1);
    sqlite.close();
  });

  it('idempotency: running handler twice does not double-fire 24h reminder', async () => {
    insertBooking(db, { createdAt: hoursAgo(25) });

    await runPendingReminders(db);
    await runPendingReminders(db); // second run

    const notifs = db.select().from(notifications).all();
    const r24 = notifs.filter((n) => n.kind === 'pending_reminder_24h');
    expect(r24).toHaveLength(1);
    sqlite.close();
  });

  it('idempotency: running handler twice does not double-fire 48h reminder', async () => {
    insertBooking(db, { createdAt: hoursAgo(50) });

    await runPendingReminders(db);
    await runPendingReminders(db); // second run

    const notifs = db.select().from(notifications).all();
    const r24 = notifs.filter((n) => n.kind === 'pending_reminder_24h');
    const r48 = notifs.filter((n) => n.kind === 'pending_reminder_48h');
    expect(r24).toHaveLength(1);
    expect(r48).toHaveLength(1);
    sqlite.close();
  });

  it('does not process non-pending bookings', async () => {
    insertBooking(db, { createdAt: hoursAgo(30), status: 'accepted' });
    insertBooking(db, { createdAt: hoursAgo(30), status: 'expired' });

    await runPendingReminders(db);

    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    sqlite.close();
  });

  it('handles multiple pending bookings independently', async () => {
    insertBooking(db, { createdAt: hoursAgo(25) }); // only 24h due
    insertBooking(db, { createdAt: hoursAgo(50) }); // both 24h and 48h due
    insertBooking(db, { createdAt: hoursAgo(10) }); // neither due

    await runPendingReminders(db);

    const notifs = db.select().from(notifications).all();
    expect(notifs.filter((n) => n.kind === 'pending_reminder_24h')).toHaveLength(2);
    expect(notifs.filter((n) => n.kind === 'pending_reminder_48h')).toHaveLength(1);
    sqlite.close();
  });
});
