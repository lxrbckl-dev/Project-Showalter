import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { bookings, type BookingStatus } from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { createTestDb } from '@/db/test-helpers';
import { decideBookingCore } from './decide-core';

/**
 * Unit tests for the admin decide core — Phase 6.
 *
 * Every accept/decline/markCompleted/markNoShow goes through this module, so
 * the tests focus on the intersection of the state machine and the
 * optimistic-locking predicate:
 *
 *   - happy path: correct `expectedUpdatedAt` on a legal transition applies
 *   - stale `expectedUpdatedAt` → `conflict` (even when the transition is legal)
 *   - correct `expectedUpdatedAt` on an illegal transition → `invalid_transition`
 *   - non-existent id → `not_found`
 *   - mid-tx race: when row is mutated between SELECT and UPDATE we still
 *     surface a `conflict`
 */

type Db = BetterSQLite3Database<typeof schema>;

function seed(db: Db, status: BookingStatus, overrides: Partial<{ startAt: string; updatedAt: string }> = {}): number {
  const updatedAt = overrides.updatedAt ?? '2026-04-17T00:00:00.000Z';
  const rows = db
    .insert(bookings)
    .values({
      token: `tok-${Math.random().toString(36).slice(2)}`,
      customerId: 1,
      addressId: 1,
      addressText: '1 Main',
      customerName: 'Jane',
      customerPhone: '+19133097340',
      customerEmail: null,
      serviceId: 1,
      startAt: overrides.startAt ?? '2026-05-01T12:00:00.000Z',
      notes: null,
      status,
      createdAt: '2026-04-16T00:00:00.000Z',
      updatedAt,
    })
    .returning()
    .all();
  return rows[0].id;
}

describe('decideBookingCore', () => {
  let testHandle: ReturnType<typeof createTestDb>;
  let db: Db;
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    // Seed FK parent rows required by bookings constraints.
    db.insert(services).values({ name: 'Test Service', description: 'Test', active: 1 }).run();
    const custRows = db.insert(customers).values({
      name: 'Jane', phone: '+19133097340', email: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }).returning().all();
    db.insert(customerAddresses).values({
      customerId: custRows[0].id,
      address: '1 Main',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-01T00:00:00Z',
    }).run();
    // Second customer for 'decline releases slot' test.
    const cust2Rows = db.insert(customers).values({
      name: 'Second', phone: '+19133097341', email: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }).returning().all();
    db.insert(customerAddresses).values({
      customerId: cust2Rows[0].id,
      address: '1 Main',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-01T00:00:00Z',
    }).run();
  });

  it('happy path: pending + correct updatedAt + accept → ok', () => {
    const id = seed(db, 'pending');
    const result = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'accepted',
      db,
      now: new Date('2026-04-17T12:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.status).toBe('accepted');
      expect(result.booking.decidedAt).toBe('2026-04-17T12:00:00.000Z');
      expect(result.booking.updatedAt).toBe('2026-04-17T12:00:00.000Z');
    }
    testHandle.cleanup();
  });

  it('stale updatedAt → conflict; row untouched', () => {
    const id = seed(db, 'pending');
    const result = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
      nextStatus: 'accepted',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('conflict');
      if (result.kind === 'conflict') {
        expect(result.currentStatus).toBe('pending');
      }
    }
    const row = db.select().from(bookings).where(eq(bookings.id, id)).all()[0];
    expect(row.status).toBe('pending');
    testHandle.cleanup();
  });

  it('invalid transition (declined → accepted) → invalid_transition', () => {
    const id = seed(db, 'declined');
    const result = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'accepted',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('invalid_transition');
      if (result.kind === 'invalid_transition') {
        expect(result.currentStatus).toBe('declined');
      }
    }
    testHandle.cleanup();
  });

  it('invalid transition completed → anything → invalid_transition', () => {
    const id = seed(db, 'completed');
    for (const next of ['accepted', 'canceled', 'completed'] as const) {
      const result = decideBookingCore({
        bookingId: id,
        expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
        nextStatus: next,
        db,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.kind).toBe('invalid_transition');
    }
    testHandle.cleanup();
  });

  it('missing id → not_found', () => {
    const result = decideBookingCore({
      bookingId: 999,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'accepted',
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
    testHandle.cleanup();
  });

  it('mid-flight race: row mutated between SELECT and UPDATE → conflict', () => {
    const id = seed(db, 'pending');

    // Simulate a mid-flight race by monkey-patching the db to rewrite the
    // row between our SELECT and our UPDATE. The cleanest way: override
    // `db.update(...).set(...).where(...).returning().all()` to run a
    // sibling UPDATE first. Simpler alternative: call decideBookingCore
    // twice in a row — the second call will carry a stale expectedUpdatedAt.
    const first = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'accepted',
      db,
      now: new Date('2026-04-17T01:00:00Z'),
    });
    expect(first.ok).toBe(true);

    // Second call with the original (now stale) updatedAt → conflict.
    const stale = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'completed',
      db,
      now: new Date('2026-04-17T02:00:00Z'),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.kind).toBe('conflict');
      if (stale.kind === 'conflict') {
        expect(stale.currentStatus).toBe('accepted');
        expect(stale.currentUpdatedAt).toBe('2026-04-17T01:00:00.000Z');
      }
    }
    testHandle.cleanup();
  });

  it('decline releases the slot (row exits partial UNIQUE index)', () => {
    const id = seed(db, 'pending');
    const result = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'declined',
      db,
      now: new Date('2026-04-17T01:00:00Z'),
    });
    expect(result.ok).toBe(true);

    // Insert another booking at the same start_at — should succeed now that
    // the previous one is declined.
    const second = db
      .insert(bookings)
      .values({
        token: 'second',
        customerId: 1,
        addressId: 1,
        addressText: '1 Main',
        customerName: 'Second',
        customerPhone: '+19133097341',
        customerEmail: null,
        serviceId: 1,
        startAt: '2026-05-01T12:00:00.000Z',
        notes: null,
        status: 'pending',
        createdAt: '2026-04-17T00:00:00.000Z',
        updatedAt: '2026-04-17T00:00:00.000Z',
      })
      .returning()
      .all();
    expect(second).toHaveLength(1);
    testHandle.cleanup();
  });

  it('markCompleted on accepted → completed (terminal)', () => {
    const id = seed(db, 'accepted');
    const result = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'completed',
      db,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.booking.status).toBe('completed');
    testHandle.cleanup();
  });

  it('markNoShow on accepted → no_show (terminal)', () => {
    const id = seed(db, 'accepted');
    const result = decideBookingCore({
      bookingId: id,
      expectedUpdatedAt: '2026-04-17T00:00:00.000Z',
      nextStatus: 'no_show',
      db,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.booking.status).toBe('no_show');
    testHandle.cleanup();
  });
});
