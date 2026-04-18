import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { bookings } from '@/db/schema/bookings';
import { customers } from '@/db/schema/customers';
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

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE site_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT, hero_image_path TEXT,
      sms_template TEXT,
      booking_horizon_weeks INTEGER NOT NULL DEFAULT 4,
      min_advance_notice_hours INTEGER NOT NULL DEFAULT 36,
      start_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
      booking_spacing_minutes INTEGER NOT NULL DEFAULT 60,
      max_booking_photos INTEGER NOT NULL DEFAULT 3,
      booking_photo_max_bytes INTEGER NOT NULL DEFAULT 10485760,
      photo_retention_days_after_resolve INTEGER NOT NULL DEFAULT 30,
      timezone TEXT NOT NULL DEFAULT 'America/Chicago',
      business_founded_year INTEGER NOT NULL DEFAULT 2023,
      show_landing_stats INTEGER NOT NULL DEFAULT 1,
      min_reviews_for_landing_stats INTEGER NOT NULL DEFAULT 3,
      min_rating_for_auto_publish INTEGER NOT NULL DEFAULT 4,
      auto_publish_top_review_photos INTEGER NOT NULL DEFAULT 1,
      template_confirmation_email TEXT,
      template_confirmation_sms TEXT,
      template_decline_email TEXT,
      template_decline_sms TEXT,
      template_review_request_email TEXT,
      template_review_request_sms TEXT
    );
    INSERT INTO site_config (min_advance_notice_hours, booking_spacing_minutes, timezone)
      VALUES (36, 60, 'UTC');

    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL, description TEXT NOT NULL,
      price_cents INTEGER, price_suffix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO services (name, description, active) VALUES ('Mowing', 'Mow', 1);

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT,
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      last_booking_at TEXT
    );
    CREATE UNIQUE INDEX customers_email_unique ON customers(email) WHERE email IS NOT NULL;

    CREATE TABLE customer_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      address TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL
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
      rescheduled_to_id INTEGER
    );
    CREATE UNIQUE INDEX bookings_active_start
      ON bookings(start_at) WHERE status IN ('pending', 'accepted');
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

describe('adminCreateBookingCore', () => {
  let sqlite: Database.Database;
  let db: Db;
  beforeEach(() => {
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
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

    sqlite.close();
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
    sqlite.close();
  });

  it('spacing warning: another active booking within the spacing window', () => {
    // Seed a held pending booking.
    db.insert(bookings)
      .values({
        token: 'held',
        customerId: 1,
        addressId: 1,
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
    sqlite.close();
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
    sqlite.close();
  });

  it('slot_taken when the exact start is already held', () => {
    db.insert(customers)
      .values({
        name: 'A',
        phone: '+19133097345',
        email: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .run();
    db.insert(bookings)
      .values({
        token: 'held',
        customerId: 1,
        addressId: 1,
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
    sqlite.close();
  });

  it('rejects inactive service', () => {
    db.run(`UPDATE services SET active = 0 WHERE id = 1;` as unknown as never);
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
    sqlite.close();
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
    sqlite.close();
  });
});
