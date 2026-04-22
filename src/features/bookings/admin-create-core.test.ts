import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { services } from '@/db/schema/services';
import { siteConfig } from '@/db/schema/site-config';
import { createTestDb } from '@/db/test-helpers';
import { adminCreateBookingCore } from './admin-create-core';

/**
 * admin-create-core tests — Phase 6.
 *
 * Ensures walk-in / phone-call bookings behave per STACK.md:
 *   - Status always starts at 'accepted' (not 'pending').
 *   - Spacing + advance-notice are SOFT warnings — without `force`, a
 *     violation returns `kind: 'warnings'`; with `force=true` the write
 *     proceeds even when warnings would fire.
 *   - "Pick existing customer" path reuses the customers row + optionally
 *     creates a new customer_addresses row.
 *   - "New customer" path goes through the match-or-create pipeline.
 */

type Db = BetterSQLite3Database<typeof schema>;

describe('adminCreateBookingCore', () => {
  let testHandle: ReturnType<typeof createTestDb>;
  let db: Db;
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    // Migrations pre-insert a site_config row with id=1. Update it for test.
    db.update(siteConfig)
      .set({ minAdvanceNoticeHours: 36, bookingSpacingMinutes: 60, timezone: 'UTC' })
      .run();
    // Seed a service row (migrations don't seed data).
    db.insert(services)
      .values({ name: 'Mowing', description: 'Mow', active: 1 })
      .run();
  });

  it('new customer path: creates rows and inserts booking in accepted status', () => {
    const result = adminCreateBookingCore({
      input: {
        serviceId: 1,
        startAt: '2026-06-01T12:00:00.000Z',
        name: 'Jane Doe',
        phone: '913-309-7340',
        email: 'jane@example.com',
        address: '500 Test Ln',
        force: true, // skip warnings for this baseline
      },
      db,
      now: new Date('2026-04-17T00:00:00Z'),
      generateToken: () => 'walk-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.booking.status).toBe('accepted');
    expect(result.booking.decidedAt).not.toBeNull();
    expect(result.booking.token).toBe('walk-1');

    const cs = db.select().from(customers).all();
    expect(cs).toHaveLength(1);
    expect(cs[0].phone).toBe('+19133097340');

    const bs = db.select().from(bookings).all();
    expect(bs).toHaveLength(1);
    expect(bs[0].customerPhone).toBe('+19133097340');
    expect(bs[0].customerName).toBe('Jane Doe');

    testHandle.cleanup();
  });

  it('soft warnings trigger without force; same payload with force succeeds', () => {
    // Start-time is "now" — well inside the 36-hour advance-notice window.
    const now = new Date('2026-04-17T00:00:00Z');
    const tooSoon = '2026-04-17T06:00:00.000Z'; // only 6h out

    const first = adminCreateBookingCore({
      input: {
        serviceId: 1,
        startAt: tooSoon,
        name: 'Jane Doe',
        phone: '913-309-7340',
        address: '1 Elm',
        force: false,
      },
      db,
      now,
    });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.kind).toBe('warnings');
      if (first.kind === 'warnings') {
        expect(first.warnings.some((w) => w.kind === 'too_soon')).toBe(true);
      }
    }
    // No booking written yet.
    expect(db.select().from(bookings).all()).toHaveLength(0);

    // Retry with force=true → succeeds.
    const second = adminCreateBookingCore({
      input: {
        serviceId: 1,
        startAt: tooSoon,
        name: 'Jane Doe',
        phone: '913-309-7340',
        address: '1 Elm',
        force: true,
      },
      db,
      now,
      generateToken: () => 'forced',
    });
    expect(second.ok).toBe(true);
    expect(db.select().from(bookings).all()).toHaveLength(1);
    testHandle.cleanup();
  });

  it('spacing warning: another active booking within the spacing window', () => {
    // Seed a customer + address + held pending booking with FK compliance.
    const custRows = db.insert(customers)
      .values({
        name: 'Held',
        phone: '+19133097340',
        email: null,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      })
      .returning()
      .all();
    const addrRows = db.insert(customerAddresses)
      .values({
        customerId: custRows[0].id,
        address: '1 Elm',
        createdAt: '2026-04-10T00:00:00.000Z',
        lastUsedAt: '2026-04-10T00:00:00.000Z',
      })
      .returning()
      .all();
    db.insert(bookings)
      .values({
        token: 'held',
        customerId: custRows[0].id,
        addressId: addrRows[0].id,
        addressText: '1 Elm',
        customerName: 'Held',
        customerPhone: '+19133097340',
        customerEmail: null,
        serviceId: 1,
        startAt: '2026-06-01T12:00:00.000Z',
        notes: null,
        status: 'accepted',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      })
      .run();

    const result = adminCreateBookingCore({
      input: {
        serviceId: 1,
        // 30 minutes after the held booking — inside the 60-minute spacing window.
        startAt: '2026-06-01T12:30:00.000Z',
        name: 'Second',
        phone: '913-309-7341',
        address: '2 Elm',
        force: false,
      },
      db,
      now: new Date('2026-04-17T00:00:00Z'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('warnings');
      if (result.kind === 'warnings') {
        expect(
          result.warnings.some((w) => w.kind === 'too_close_to_another'),
        ).toBe(true);
      }
    }
    testHandle.cleanup();
  });

  it('existing customer: reuses customer + creates a new address', () => {
    db.insert(customers)
      .values({
        name: 'Returning Customer',
        phone: '+19133097345',
        email: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .run();
    const existing = db.select().from(customers).all();
    expect(existing).toHaveLength(1);

    const result = adminCreateBookingCore({
      input: {
        customerId: existing[0].id,
        serviceId: 1,
        startAt: '2026-06-05T12:00:00.000Z',
        address: '99 New Road',
        force: true,
      },
      db,
      now: new Date('2026-04-17T00:00:00Z'),
      generateToken: () => 'reuse-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No new customer row.
    expect(db.select().from(customers).all()).toHaveLength(1);

    // Booking has correct denormalized customer snapshot.
    expect(result.booking.customerName).toBe('Returning Customer');
    expect(result.booking.customerPhone).toBe('+19133097345');
    testHandle.cleanup();
  });

  it('slot_taken when the exact start is already held', () => {
    const custRows = db.insert(customers)
      .values({
        name: 'A',
        phone: '+19133097345',
        email: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .returning()
      .all();
    const addrRows = db.insert(customerAddresses)
      .values({
        customerId: custRows[0].id,
        address: '1 Elm',
        createdAt: '2026-04-10T00:00:00.000Z',
        lastUsedAt: '2026-04-10T00:00:00.000Z',
      })
      .returning()
      .all();
    db.insert(bookings)
      .values({
        token: 'held',
        customerId: custRows[0].id,
        addressId: addrRows[0].id,
        addressText: '1 Elm',
        customerName: 'Held',
        customerPhone: '+19133097345',
        customerEmail: null,
        serviceId: 1,
        startAt: '2026-06-05T12:00:00.000Z',
        notes: null,
        status: 'accepted',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      })
      .run();

    const result = adminCreateBookingCore({
      input: {
        serviceId: 1,
        startAt: '2026-06-05T12:00:00.000Z',
        name: 'Second',
        phone: '913-309-7341',
        address: '2 Elm',
        force: true, // skip warnings so we hit the UNIQUE index directly
      },
      db,
      now: new Date('2026-04-17T00:00:00Z'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('slot_taken');
    testHandle.cleanup();
  });

  it('rejects inactive service', () => {
    db.update(services).set({ active: 0 }).run();
    const result = adminCreateBookingCore({
      input: {
        serviceId: 1,
        startAt: '2026-06-05T12:00:00.000Z',
        name: 'Jane',
        phone: '913-309-7340',
        address: '1 Elm',
        force: true,
      },
      db,
      now: new Date('2026-04-17T00:00:00Z'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('service_inactive');
    testHandle.cleanup();
  });

  it('validation errors when new-customer fields are missing', () => {
    const result = adminCreateBookingCore({
      input: {
        serviceId: 1,
        startAt: '2026-06-05T12:00:00.000Z',
        force: true,
      },
      db,
      now: new Date('2026-04-17T00:00:00Z'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
    testHandle.cleanup();
  });
});
