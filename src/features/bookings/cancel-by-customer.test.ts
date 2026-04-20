import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { bookings, type BookingStatus } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { services } from '@/db/schema/services';
import { cancelByCustomerCore } from './cancel-by-customer-core';

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL, description TEXT NOT NULL,
      price_cents INTEGER, price_suffix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL, address_id INTEGER NOT NULL,
      address_text TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, customer_email TEXT,
      service_id INTEGER NOT NULL, start_at TEXT NOT NULL,
      notes TEXT, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, decided_at TEXT,
      rescheduled_to_id INTEGER, cancel_reason TEXT
    );
    CREATE UNIQUE INDEX bookings_active_start
      ON bookings(start_at) WHERE status IN ('pending', 'accepted');
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      kind TEXT NOT NULL, payload_json TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      booking_id INTEGER
    );
  `);
  const db = drizzle(sqlite, { schema }) as Db;
  db.insert(services)
    .values({ name: 'Mowing', description: 'Mow', active: 1 })
    .run();
  return { sqlite, db };
}

function seedBooking(db: Db, status: BookingStatus): string {
  const token = `tok-${Math.random().toString(36).slice(2)}`;
  db.insert(bookings)
    .values({
      token,
      customerId: 1,
      addressId: 1,
      addressText: '1 Elm',
      customerName: 'Jane',
      customerPhone: '+19133097340',
      customerEmail: null,
      serviceId: 1,
      startAt: '2026-05-01T15:00:00.000Z',
      notes: null,
      status,
      createdAt: '2026-04-17T00:00:00Z',
      updatedAt: '2026-04-17T00:00:00Z',
    })
    .run();
  return token;
}

describe('cancelByCustomerCore — state machine guards', () => {
  it('cancels a pending booking; writes no notification (notifications scoped to booking_submitted only)', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'pending');
    const result = cancelByCustomerCore({ token, db, now: new Date('2026-04-18T12:00:00Z') });
    expect(result).toEqual({ ok: true });

    const after = db.select().from(bookings).all()[0];
    expect(after.status).toBe('canceled');
    expect(after.decidedAt).toBe('2026-04-18T12:00:00.000Z');

    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    sqlite.close();
  });

  it('cancels an accepted booking', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'accepted');
    const result = cancelByCustomerCore({ token, db });
    expect(result).toEqual({ ok: true });
    sqlite.close();
  });

  it('rejects cancel from completed (TERMINAL)', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'completed');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    expect(result.status).toBe('completed');
    sqlite.close();
  });

  it('rejects cancel from declined', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'declined');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    expect(result.status).toBe('declined');
    sqlite.close();
  });

  it('rejects cancel from expired', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'expired');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    sqlite.close();
  });

  it('rejects cancel from no_show', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'no_show');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    sqlite.close();
  });

  it('rejects cancel from already canceled', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'canceled');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    sqlite.close();
  });

  it('returns not_found for an unknown token', () => {
    const { sqlite, db } = makeDb();
    const result = cancelByCustomerCore({ token: 'nonexistent', db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('not_found');
    sqlite.close();
  });

  it('slot is re-bookable after cancel (partial UNIQUE releases)', () => {
    const { sqlite, db } = makeDb();
    const token = seedBooking(db, 'pending');
    cancelByCustomerCore({ token, db });
    // Same start_at should now be insertable again.
    expect(() => {
      db.insert(bookings)
        .values({
          token: 'new-token',
          customerId: 2,
          addressId: 2,
          addressText: '2 Oak',
          customerName: 'Next',
          customerPhone: '+19133097341',
          customerEmail: null,
          serviceId: 1,
          startAt: '2026-05-01T15:00:00.000Z',
          notes: null,
          status: 'pending',
          createdAt: '2026-04-18T00:00:00Z',
          updatedAt: '2026-04-18T00:00:00Z',
        })
        .run();
    }).not.toThrow();
    sqlite.close();
  });
});
