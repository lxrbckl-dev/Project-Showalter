import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { bookings } from '@/db/schema/bookings';
import { reviews } from '@/db/schema/reviews';
import { reviewPhotos } from '@/db/schema/review-photos';
import {
  searchCustomers,
  getCustomerFullDetail,
} from './queries';

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_booking_at TEXT
    );
    CREATE TABLE customer_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER,
      price_suffix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      address_id INTEGER NOT NULL,
      address_text TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      service_id INTEGER NOT NULL REFERENCES services(id),
      start_at TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_at TEXT,
      rescheduled_to_id INTEGER
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      booking_id INTEGER,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      rating INTEGER,
      review_text TEXT,
      requested_at TEXT NOT NULL,
      submitted_at TEXT
    );
    CREATE TABLE review_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      review_id INTEGER NOT NULL REFERENCES reviews(id),
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

const NOW = '2026-04-17T00:00:00.000Z';

function seedCustomer(
  db: Db,
  opts: {
    name: string;
    phone: string;
    email?: string;
    lastBookingAt?: string | null;
  },
): number {
  const rows = db
    .insert(customers)
    .values({
      name: opts.name,
      phone: opts.phone,
      email: opts.email ?? null,
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
      lastBookingAt: opts.lastBookingAt ?? null,
    })
    .returning()
    .all();
  return rows[0].id;
}

function seedAddress(db: Db, customerId: number, address: string, lastUsedAt = NOW): number {
  const rows = db
    .insert(customerAddresses)
    .values({
      customerId,
      address,
      createdAt: NOW,
      lastUsedAt,
    })
    .returning()
    .all();
  return rows[0].id;
}

function seedService(db: Db): number {
  const rows = db
    .insert(schema.services)
    .values({
      name: 'Lawn Mowing',
      description: 'Mow the lawn',
      priceCents: null,
      priceSuffix: '',
      sortOrder: 1,
      active: 1,
    })
    .returning()
    .all();
  return rows[0].id;
}

function seedBooking(db: Db, customerId: number, serviceId: number, status = 'completed'): number {
  const rows = db
    .insert(bookings)
    .values({
      token: `tok-b-${Math.random().toString(36).slice(2)}`,
      customerId,
      addressId: 1,
      addressText: '123 Main St',
      customerName: 'Test Customer',
      customerPhone: '+19133097340',
      customerEmail: null,
      serviceId,
      startAt: NOW,
      status,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning()
    .all();
  return rows[0].id;
}

function seedReview(
  db: Db,
  customerId: number,
  opts: { status: 'pending' | 'submitted'; rating?: number },
): number {
  const rows = db
    .insert(reviews)
    .values({
      bookingId: null,
      customerId,
      token: `tok-r-${Math.random().toString(36).slice(2)}`,
      status: opts.status,
      rating: opts.rating ?? null,
      requestedAt: NOW,
      submittedAt: opts.status === 'submitted' ? NOW : null,
    })
    .returning()
    .all();
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// searchCustomers
// ---------------------------------------------------------------------------

describe('searchCustomers', () => {
  let db: Db;
  beforeEach(() => {
    ({ db } = makeDb());
  });

  it('empty query returns all customers ordered by last_booking_at DESC', () => {
    const cId1 = seedCustomer(db, { name: 'Alice', phone: '+19130000001', lastBookingAt: '2026-01-01T00:00:00Z' });
    const cId2 = seedCustomer(db, { name: 'Bob', phone: '+19130000002', lastBookingAt: '2026-03-01T00:00:00Z' });

    const results = searchCustomers(db, '', 25, 0);
    expect(results).toHaveLength(2);
    // Bob has the more recent booking and should come first
    expect(results[0].customer.id).toBe(cId2);
    expect(results[1].customer.id).toBe(cId1);
  });

  it('matches by name (case-insensitive)', () => {
    seedCustomer(db, { name: 'Alice Smith', phone: '+19130000001' });
    seedCustomer(db, { name: 'Bob Jones', phone: '+19130000002' });

    const results = searchCustomers(db, 'alice', 25, 0);
    expect(results).toHaveLength(1);
    expect(results[0].customer.name).toBe('Alice Smith');
  });

  it('matches by phone', () => {
    seedCustomer(db, { name: 'Alice', phone: '+19133097340' });
    seedCustomer(db, { name: 'Bob', phone: '+19130000002' });

    const results = searchCustomers(db, '3097340', 25, 0);
    expect(results).toHaveLength(1);
    expect(results[0].customer.name).toBe('Alice');
  });

  it('matches by email', () => {
    seedCustomer(db, { name: 'Alice', phone: '+19130000001', email: 'alice@example.com' });
    seedCustomer(db, { name: 'Bob', phone: '+19130000002', email: 'bob@example.com' });

    const results = searchCustomers(db, 'alice@example', 25, 0);
    expect(results).toHaveLength(1);
    expect(results[0].customer.name).toBe('Alice');
  });

  it('matches by address', () => {
    const cId1 = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    const cId2 = seedCustomer(db, { name: 'Bob', phone: '+19130000002' });
    seedAddress(db, cId1, '123 Oak St');
    seedAddress(db, cId2, '456 Maple Ave');

    const results = searchCustomers(db, 'Oak St', 25, 0);
    expect(results).toHaveLength(1);
    expect(results[0].customer.id).toBe(cId1);
  });

  it('address search is case-insensitive', () => {
    const cId1 = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    seedAddress(db, cId1, '123 Oak Street');

    const results = searchCustomers(db, 'oak street', 25, 0);
    expect(results).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    const results = searchCustomers(db, 'zzznomatch', 25, 0);
    expect(results).toHaveLength(0);
  });

  it('includes totalBookings count', () => {
    const cId = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    const svcId = seedService(db);
    seedBooking(db, cId, svcId);
    seedBooking(db, cId, svcId);

    const results = searchCustomers(db, 'Alice', 25, 0);
    expect(results[0].totalBookings).toBe(2);
  });

  it('pagination: limit and offset work correctly', () => {
    for (let i = 0; i < 5; i++) {
      seedCustomer(db, { name: `Customer ${i}`, phone: `+1913000000${i}` });
    }
    const page1 = searchCustomers(db, '', 3, 0);
    const page2 = searchCustomers(db, '', 3, 3);

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    // No overlap
    const ids1 = page1.map((r) => r.customer.id);
    const ids2 = page2.map((r) => r.customer.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCustomerFullDetail
// ---------------------------------------------------------------------------

describe('getCustomerFullDetail', () => {
  let db: Db;
  beforeEach(() => {
    ({ db } = makeDb());
  });

  it('returns null for unknown customerId', () => {
    expect(getCustomerFullDetail(db, 9999)).toBeNull();
  });

  it('returns customer + addresses + bookings + reviews + photos', () => {
    const cId = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    seedAddress(db, cId, '123 Oak St');
    const svcId = seedService(db);
    seedBooking(db, cId, svcId);
    const rId = seedReview(db, cId, { status: 'submitted', rating: 5 });

    // Insert a review photo
    db.insert(reviewPhotos).values({
      reviewId: rId,
      filePath: 'reviews/1/photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
      createdAt: NOW,
    }).run();

    const detail = getCustomerFullDetail(db, cId);
    expect(detail).not.toBeNull();
    expect(detail!.customer.id).toBe(cId);
    expect(detail!.addresses).toHaveLength(1);
    expect(detail!.bookingRows).toHaveLength(1);
    expect(detail!.reviewRows).toHaveLength(1);
    expect(detail!.photos).toHaveLength(1);
    expect(detail!.photos[0].filePath).toBe('reviews/1/photo.jpg');
  });

  it('addresses are sorted by last_used_at DESC', () => {
    const cId = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    seedAddress(db, cId, 'Old Address', '2026-01-01T00:00:00Z');
    seedAddress(db, cId, 'New Address', '2026-04-01T00:00:00Z');

    const detail = getCustomerFullDetail(db, cId)!;
    expect(detail.addresses[0].address).toBe('New Address');
    expect(detail.addresses[1].address).toBe('Old Address');
  });

  it('bookings are sorted by start_at DESC (most recent first)', () => {
    const cId = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    const svcId = seedService(db);

    // Seed two bookings with different start_at
    db.insert(bookings).values({
      token: 'tok-old',
      customerId: cId,
      addressId: 1,
      addressText: '123 Main',
      customerName: 'Alice',
      customerPhone: '+19130000001',
      serviceId: svcId,
      startAt: '2026-01-01T00:00:00Z',
      status: 'completed',
      createdAt: NOW,
      updatedAt: NOW,
    }).run();
    db.insert(bookings).values({
      token: 'tok-new',
      customerId: cId,
      addressId: 1,
      addressText: '123 Main',
      customerName: 'Alice',
      customerPhone: '+19130000001',
      serviceId: svcId,
      startAt: '2026-04-01T00:00:00Z',
      status: 'completed',
      createdAt: NOW,
      updatedAt: NOW,
    }).run();

    const detail = getCustomerFullDetail(db, cId)!;
    expect(detail.bookingRows[0].startAt).toBe('2026-04-01T00:00:00Z');
    expect(detail.bookingRows[1].startAt).toBe('2026-01-01T00:00:00Z');
  });

  it('returns empty arrays when customer has no related data', () => {
    const cId = seedCustomer(db, { name: 'Alice', phone: '+19130000001' });
    const detail = getCustomerFullDetail(db, cId)!;
    expect(detail.addresses).toHaveLength(0);
    expect(detail.bookingRows).toHaveLength(0);
    expect(detail.reviewRows).toHaveLength(0);
    expect(detail.photos).toHaveLength(0);
  });
});
