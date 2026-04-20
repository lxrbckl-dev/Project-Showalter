import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { rescheduleBookingCore } from './reschedule-core';

/**
 * Reschedule-core tests — Phase 6.
 *
 * Covers:
 *   - happy path: old row canceled + new row accepted + forward pointer set
 *   - transactional rollback when the new booking's start_at is already held
 *   - stale updatedAt → conflict
 *   - reschedule from a terminal state → invalid_transition
 *   - token generator is called once per successful reschedule
 *   - rescheduling TO the same start_at: old row must release its hold
 *     inside the transaction, otherwise the new INSERT would trip the
 *     partial UNIQUE index on itself.
 */

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL, address_id INTEGER NOT NULL,
      address_text TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, customer_email TEXT,
      service_id INTEGER NOT NULL, start_at TEXT NOT NULL,
      notes TEXT, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, decided_at TEXT,
      rescheduled_to_id INTEGER,
      cancel_reason TEXT
    );
    CREATE UNIQUE INDEX bookings_active_start
      ON bookings(start_at) WHERE status IN ('pending', 'accepted');
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

function seedAccepted(db: Db, startAt = '2026-05-01T12:00:00.000Z'): number {
  const rows = db
    .insert(bookings)
    .values({
      token: `old-${Math.random().toString(36).slice(2)}`,
      customerId: 1,
      addressId: 1,
      addressText: '1 Elm',
      customerName: 'Jane',
      customerPhone: '+19133097340',
      customerEmail: 'jane@example.com',
      serviceId: 1,
      startAt,
      notes: 'original note',
      status: 'accepted',
      createdAt: '2026-04-10T00:00:00.000Z',
      updatedAt: '2026-04-17T00:00:00.000Z',
      decidedAt: '2026-04-11T00:00:00.000Z',
    })
    .returning()
    .all();
  return rows[0].id;
}

describe('rescheduleBookingCore', () => {
  let sqlite: Database.Database;
  let db: Db;
  beforeEach(() => {
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
  });

  it('happy path: cancels old + creates new + links forward pointer', () => {
    const oldId = seedAccepted(db);
    const result = rescheduleBookingCore({
      oldBookingId: oldId,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      newStartAt: '2026-05-02T15:00:00.000Z',
      db,
      now: new Date('2026-04-17T06:00:00Z'),
      generateToken: () => 'new-tok',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Old row canceled + points forward.
    expect(result.oldBooking.status).toBe('canceled');
    expect(result.oldBooking.decidedAt).toBe('2026-04-17T06:00:00.000Z');
    expect(result.oldBooking.rescheduledToId).toBe(result.newBooking.id);

    // New row accepted, carries forward fields, fresh token + timestamps.
    expect(result.newBooking.status).toBe('accepted');
    expect(result.newBooking.token).toBe('new-tok');
    expect(result.newBooking.customerId).toBe(1);
    expect(result.newBooking.addressText).toBe('1 Elm');
    expect(result.newBooking.notes).toBe('original note');
    expect(result.newBooking.startAt).toBe('2026-05-02T15:00:00.000Z');
    expect(result.newBooking.decidedAt).toBe('2026-04-17T06:00:00.000Z');

    // Persisted state matches.
    const persisted = db
      .select()
      .from(bookings)
      .where(eq(bookings.id, oldId))
      .all()[0];
    expect(persisted.status).toBe('canceled');
    expect(persisted.rescheduledToId).toBe(result.newBooking.id);

    sqlite.close();
  });

  it('rollback when the new slot is already held — neither row changes', () => {
    const oldId = seedAccepted(db, '2026-05-01T12:00:00.000Z');
    // Seed another active booking at the target start — the transaction
    // must roll back both mutations when the insert hits the UNIQUE index.
    db.insert(bookings)
      .values({
        token: 'blocker',
        customerId: 2,
        addressId: 2,
        addressText: '2 Elm',
        customerName: 'Other',
        customerPhone: '+19133097341',
        customerEmail: null,
        serviceId: 1,
        startAt: '2026-06-01T12:00:00.000Z',
        notes: null,
        status: 'accepted',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      })
      .run();

    const result = rescheduleBookingCore({
      oldBookingId: oldId,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      newStartAt: '2026-06-01T12:00:00.000Z',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('slot_taken');

    // Old row must still be accepted (transaction rolled back).
    const persisted = db
      .select()
      .from(bookings)
      .where(eq(bookings.id, oldId))
      .all()[0];
    expect(persisted.status).toBe('accepted');
    expect(persisted.rescheduledToId).toBeNull();

    // Only 2 rows total (old + blocker) — the new one was rolled back.
    expect(db.select().from(bookings).all()).toHaveLength(2);
    sqlite.close();
  });

  it('stale updatedAt → conflict; nothing changes', () => {
    const oldId = seedAccepted(db);
    const result = rescheduleBookingCore({
      oldBookingId: oldId,
      expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
      newStartAt: '2026-05-02T15:00:00.000Z',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('conflict');
    const row = db
      .select()
      .from(bookings)
      .where(eq(bookings.id, oldId))
      .all()[0];
    expect(row.status).toBe('accepted');
    expect(db.select().from(bookings).all()).toHaveLength(1);
    sqlite.close();
  });

  it('terminal source (completed) → invalid_transition', () => {
    const rows = db
      .insert(bookings)
      .values({
        token: 't-done',
        customerId: 1,
        addressId: 1,
        addressText: '1 Elm',
        customerName: 'Jane',
        customerPhone: '+19133097340',
        customerEmail: null,
        serviceId: 1,
        startAt: '2026-05-01T12:00:00.000Z',
        notes: null,
        status: 'completed',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      })
      .returning()
      .all();
    const result = rescheduleBookingCore({
      oldBookingId: rows[0].id,
      expectedUpdatedAt: '2026-04-01T00:00:00.000Z',
      newStartAt: '2026-06-01T12:00:00.000Z',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('invalid_transition');
    sqlite.close();
  });

  it('same-slot reschedule: old row releases inside tx before new INSERT', () => {
    const oldId = seedAccepted(db, '2026-05-01T12:00:00.000Z');
    const result = rescheduleBookingCore({
      oldBookingId: oldId,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      newStartAt: '2026-05-01T12:00:00.000Z',
      db,
      generateToken: () => 'same-slot-new',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newBooking.startAt).toBe('2026-05-01T12:00:00.000Z');
      expect(result.oldBooking.status).toBe('canceled');
    }
    sqlite.close();
  });

  it('invalid newStartAt shape → invalid_start_at', () => {
    const oldId = seedAccepted(db);
    const result = rescheduleBookingCore({
      oldBookingId: oldId,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      newStartAt: 'not-an-iso',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('invalid_start_at');
    sqlite.close();
  });

  it('missing id → not_found', () => {
    const result = rescheduleBookingCore({
      oldBookingId: 999,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      newStartAt: '2026-05-02T15:00:00.000Z',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
    sqlite.close();
  });
});
