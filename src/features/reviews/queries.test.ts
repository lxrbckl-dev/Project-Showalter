import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { services } from '@/db/schema/services';
import { bookings } from '@/db/schema/bookings';
import { reviews } from '@/db/schema/reviews';
import { reviewPhotos } from '@/db/schema/review-photos';
import { createTestDb } from '@/db/test-helpers';
import {
  findPendingReviewForBooking,
  getReviewById,
  getReviewByToken,
  listReviews,
} from './queries';

type Db = BetterSQLite3Database<typeof schema>;

let testHandle: ReturnType<typeof createTestDb>;
let db: Db;

function seedCustomer(
  name: string,
  phone: string,
  email?: string,
): number {
  const rows = db
    .insert(customers)
    .values({
      name,
      phone,
      email: email ?? null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastBookingAt: null,
    })
    .returning()
    .all();
  return rows[0].id;
}

function seedReview(
  customerId: number,
  opts: {
    status: 'pending' | 'submitted';
    rating?: number;
    submittedAt?: string;
    token?: string;
    bookingId?: number | null;
    text?: string;
  },
): number {
  const rows = db
    .insert(reviews)
    .values({
      bookingId: opts.bookingId ?? null,
      customerId,
      token: opts.token ?? `tok-${Math.random().toString(36).slice(2)}`,
      status: opts.status,
      rating: opts.rating ?? null,
      reviewText: opts.text ?? null,
      requestedAt: '2026-04-17T00:00:00.000Z',
      submittedAt: opts.submittedAt ?? null,
    })
    .returning()
    .all();
  return rows[0].id;
}

/**
 * Seed a minimal booking row for FK compliance when a review references a
 * booking_id. Returns the booking's id.
 */
function seedBookingForFk(customerId: number): number {
  // Ensure service row exists (idempotent).
  testHandle.sqlite.exec(
    `INSERT OR IGNORE INTO services (id, name, description, active) VALUES (1, 'Test', 'Test', 1)`,
  );
  const addrRows = db.insert(customerAddresses)
    .values({
      customerId,
      address: '1 Test St',
      createdAt: '2026-01-01T00:00:00Z',
      lastUsedAt: '2026-01-01T00:00:00Z',
    })
    .returning()
    .all();
  const bRows = db.insert(bookings)
    .values({
      token: `bk-${Math.random().toString(36).slice(2)}`,
      customerId,
      addressId: addrRows[0].id,
      addressText: '1 Test St',
      customerName: 'Test',
      customerPhone: '+19130000000',
      customerEmail: null,
      serviceId: 1,
      startAt: '2026-06-01T12:00:00Z',
      notes: null,
      status: 'accepted',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    .returning()
    .all();
  return bRows[0].id;
}

describe('listReviews', () => {
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
  });

  it('returns only submitted reviews, excludes pending', () => {
    const c = seedCustomer('Alice', '+19130000001');
    seedReview(c, { status: 'pending' });
    seedReview(c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    const rows = listReviews(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('submitted');
    testHandle.cleanup();
  });

  it('filters by exact rating', () => {
    const c = seedCustomer('Alice', '+19130000002');
    seedReview(c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    seedReview(c, {
      status: 'submitted',
      rating: 3,
      submittedAt: '2026-04-18T01:00:00.000Z',
    });
    const fiveStars = listReviews(db, { rating: 5 });
    expect(fiveStars).toHaveLength(1);
    expect(fiveStars[0].rating).toBe(5);
    testHandle.cleanup();
  });

  it('filters by date range (inclusive)', () => {
    const c = seedCustomer('Alice', '+19130000003');
    seedReview(c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-10T00:00:00.000Z',
    });
    seedReview(c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-20T00:00:00.000Z',
    });
    const rows = listReviews(db, {
      from: '2026-04-15T00:00:00.000Z',
      to: '2026-04-25T00:00:00.000Z',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].submittedAt).toBe('2026-04-20T00:00:00.000Z');
    testHandle.cleanup();
  });

  it('filters by customer q (LIKE name/phone/email)', () => {
    const a = seedCustomer('Alice Smith', '+19131111111', 'alice@example.com');
    const b = seedCustomer('Bob Jones', '+19132222222');
    seedReview(a, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    seedReview(b, {
      status: 'submitted',
      rating: 4,
      submittedAt: '2026-04-18T01:00:00.000Z',
    });

    const byName = listReviews(db, { q: 'alice' });
    expect(byName).toHaveLength(1);
    expect(byName[0].customerName).toBe('Alice Smith');

    const byEmail = listReviews(db, { q: 'example.com' });
    expect(byEmail).toHaveLength(1);

    const byPhone = listReviews(db, { q: '1111' });
    expect(byPhone).toHaveLength(1);
    testHandle.cleanup();
  });

  it('joins customer data + photo counts', () => {
    const c = seedCustomer('Carla', '+19133333333', 'carla@example.com');
    const rid = seedReview(c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    db.insert(reviewPhotos)
      .values({
        reviewId: rid,
        filePath: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        createdAt: '2026-04-18T00:00:00.000Z',
      })
      .run();
    const rows = listReviews(db);
    expect(rows[0].customerName).toBe('Carla');
    expect(rows[0].customerEmail).toBe('carla@example.com');
    expect(rows[0].photoCount).toBe(1);
    testHandle.cleanup();
  });
});

describe('getReviewById', () => {
  it('returns review with customer + photos', () => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    const c = seedCustomer('Dan', '+19134444444');
    const rid = seedReview(c, {
      status: 'submitted',
      rating: 4,
      submittedAt: '2026-04-18T00:00:00.000Z',
      text: 'Nice!',
    });
    db.insert(reviewPhotos)
      .values({
        reviewId: rid,
        filePath: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        createdAt: '2026-04-18T00:00:00.000Z',
      })
      .run();
    const detail = getReviewById(db, rid);
    expect(detail).not.toBeNull();
    expect(detail?.reviewText).toBe('Nice!');
    expect(detail?.customer?.name).toBe('Dan');
    expect(detail?.photos).toHaveLength(1);
    testHandle.cleanup();
  });

  it('returns null for missing id', () => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    expect(getReviewById(db, 999)).toBeNull();
    testHandle.cleanup();
  });
});

describe('getReviewByToken', () => {
  it('returns review + customer name when token matches', () => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    const c = seedCustomer('Ellie', '+19135555555');
    seedReview(c, { status: 'pending', token: 'ellie-token' });
    const result = getReviewByToken(db, 'ellie-token');
    expect(result?.customerName).toBe('Ellie');
    expect(result?.status).toBe('pending');
    testHandle.cleanup();
  });

  it('returns null for unknown token', () => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    expect(getReviewByToken(db, 'does-not-exist')).toBeNull();
    testHandle.cleanup();
  });
});

describe('findPendingReviewForBooking', () => {
  it('returns the pending row when one exists', () => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    const c = seedCustomer('Fred', '+19136666666');
    const bookingId = seedBookingForFk(c);
    const rid = seedReview(c, {
      status: 'pending',
      bookingId,
      token: 'fred-token',
    });
    const found = findPendingReviewForBooking(db, bookingId);
    expect(found?.id).toBe(rid);
    testHandle.cleanup();
  });

  it('returns null when booking only has submitted reviews', () => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
    const c = seedCustomer('Fred', '+19136666667');
    const bookingId = seedBookingForFk(c);
    seedReview(c, {
      status: 'submitted',
      rating: 5,
      bookingId,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    const found = findPendingReviewForBooking(db, bookingId);
    expect(found).toBeNull();
    testHandle.cleanup();
  });
});
