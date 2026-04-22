import { describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { bookings, type BookingStatus } from '@/db/schema/bookings';
import { notifications } from '@/db/schema/notifications';
import { services } from '@/db/schema/services';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { createTestDb } from '@/db/test-helpers';
import { cancelByCustomerCore } from './cancel-by-customer-core';

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): ReturnType<typeof createTestDb> & { db: Db } {
  const handle = createTestDb({ inMemory: true });
  const db = handle.db as Db;
  // Seed FK parent rows required by bookings constraints.
  db.insert(services).values({ name: 'Mowing', description: 'Mow', active: 1 }).run();
  const custRows = db.insert(customers).values({
    name: 'Jane', phone: '+19133097340', email: null,
    createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z',
  }).returning().all();
  db.insert(customerAddresses).values({
    customerId: custRows[0].id,
    address: '1 Elm',
    createdAt: '2026-04-17T00:00:00Z',
    lastUsedAt: '2026-04-17T00:00:00Z',
  }).run();
  // Second customer for the 're-bookable after cancel' test.
  const cust2Rows = db.insert(customers).values({
    name: 'Next', phone: '+19133097341', email: null,
    createdAt: '2026-04-17T00:00:00Z', updatedAt: '2026-04-17T00:00:00Z',
  }).returning().all();
  db.insert(customerAddresses).values({
    customerId: cust2Rows[0].id,
    address: '2 Oak',
    createdAt: '2026-04-17T00:00:00Z',
    lastUsedAt: '2026-04-17T00:00:00Z',
  }).run();
  return { ...handle, db };
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
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'pending');
    const result = cancelByCustomerCore({ token, db, now: new Date('2026-04-18T12:00:00Z') });
    expect(result).toEqual({ ok: true });

    const after = db.select().from(bookings).all()[0];
    expect(after.status).toBe('canceled');
    expect(after.decidedAt).toBe('2026-04-18T12:00:00.000Z');

    const notifs = db.select().from(notifications).all();
    expect(notifs).toHaveLength(0);
    cleanup();
  });

  it('cancels an accepted booking', () => {
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'accepted');
    const result = cancelByCustomerCore({ token, db });
    expect(result).toEqual({ ok: true });
    cleanup();
  });

  it('rejects cancel from completed (TERMINAL)', () => {
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'completed');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    expect(result.status).toBe('completed');
    cleanup();
  });

  it('rejects cancel from declined', () => {
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'declined');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    expect(result.status).toBe('declined');
    cleanup();
  });

  it('rejects cancel from expired', () => {
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'expired');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    cleanup();
  });

  it('rejects cancel from no_show', () => {
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'no_show');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    cleanup();
  });

  it('rejects cancel from already canceled', () => {
    const { db, cleanup } = makeDb();
    const token = seedBooking(db, 'canceled');
    const result = cancelByCustomerCore({ token, db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('already_terminal');
    cleanup();
  });

  it('returns not_found for an unknown token', () => {
    const { db, cleanup } = makeDb();
    const result = cancelByCustomerCore({ token: 'nonexistent', db });
    if (result.ok) throw new Error('expected failure');
    expect(result.kind).toBe('not_found');
    cleanup();
  });

  it('slot is re-bookable after cancel (partial UNIQUE releases)', () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });
});
