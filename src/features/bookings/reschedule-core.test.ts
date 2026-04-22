import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { createTestDb } from '@/db/test-helpers';
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
  let testHandle: ReturnType<typeof createTestDb>;
  let db: Db;
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    // Seed FK parent rows required by bookings constraints.
    db.insert(services).values({ name: 'Test Service', description: 'Test', active: 1 }).run();
    const custRows = db.insert(customers).values({
      name: 'Jane', phone: '+19133097340', email: 'jane@example.com',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }).returning().all();
    db.insert(customerAddresses).values({
      customerId: custRows[0].id,
      address: '1 Elm',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-01T00:00:00Z',
    }).run();
    // Second customer + address for the "blocker" booking in rollback test.
    const cust2Rows = db.insert(customers).values({
      name: 'Other', phone: '+19133097341', email: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }).returning().all();
    db.insert(customerAddresses).values({
      customerId: cust2Rows[0].id,
      address: '2 Elm',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-01T00:00:00Z',
    }).run();
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

    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
  });
});
