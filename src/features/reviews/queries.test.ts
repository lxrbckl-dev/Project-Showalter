import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { customers } from '@/db/schema/customers';
import { reviews } from '@/db/schema/reviews';
import { reviewPhotos } from '@/db/schema/review-photos';
import {
  findPendingReviewForBooking,
  getReviewById,
  getReviewByToken,
  listReviews,
} from './queries';

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_booking_at TEXT
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      booking_id INTEGER, customer_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      rating INTEGER, review_text TEXT,
      requested_at TEXT NOT NULL, submitted_at TEXT
    );
    CREATE TABLE review_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      review_id INTEGER NOT NULL, file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

function seedCustomer(
  db: Db,
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
  db: Db,
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

describe('listReviews', () => {
  let sqlite: Database.Database;
  let db: Db;
  beforeEach(() => {
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
  });

  it('returns only submitted reviews, excludes pending', () => {
    const c = seedCustomer(db, 'Alice', '+19130000001');
    seedReview(db, c, { status: 'pending' });
    seedReview(db, c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    const rows = listReviews(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('submitted');
    sqlite.close();
  });

  it('filters by exact rating', () => {
    const c = seedCustomer(db, 'Alice', '+19130000002');
    seedReview(db, c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    seedReview(db, c, {
      status: 'submitted',
      rating: 3,
      submittedAt: '2026-04-18T01:00:00.000Z',
    });
    const fiveStars = listReviews(db, { rating: 5 });
    expect(fiveStars).toHaveLength(1);
    expect(fiveStars[0].rating).toBe(5);
    sqlite.close();
  });

  it('filters by date range (inclusive)', () => {
    const c = seedCustomer(db, 'Alice', '+19130000003');
    seedReview(db, c, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-10T00:00:00.000Z',
    });
    seedReview(db, c, {
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
    sqlite.close();
  });

  it('filters by customer q (LIKE name/phone/email)', () => {
    const a = seedCustomer(db, 'Alice Smith', '+19131111111', 'alice@example.com');
    const b = seedCustomer(db, 'Bob Jones', '+19132222222');
    seedReview(db, a, {
      status: 'submitted',
      rating: 5,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    seedReview(db, b, {
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
    sqlite.close();
  });

  it('joins customer data + photo counts', () => {
    const c = seedCustomer(db, 'Carla', '+19133333333', 'carla@example.com');
    const rid = seedReview(db, c, {
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
    sqlite.close();
  });
});

describe('getReviewById', () => {
  it('returns review with customer + photos', () => {
    const { sqlite, db } = makeDb();
    const c = seedCustomer(db, 'Dan', '+19134444444');
    const rid = seedReview(db, c, {
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
    sqlite.close();
  });

  it('returns null for missing id', () => {
    const { sqlite, db } = makeDb();
    expect(getReviewById(db, 999)).toBeNull();
    sqlite.close();
  });
});

describe('getReviewByToken', () => {
  it('returns review + customer name when token matches', () => {
    const { sqlite, db } = makeDb();
    const c = seedCustomer(db, 'Ellie', '+19135555555');
    seedReview(db, c, { status: 'pending', token: 'ellie-token' });
    const result = getReviewByToken(db, 'ellie-token');
    expect(result?.customerName).toBe('Ellie');
    expect(result?.status).toBe('pending');
    sqlite.close();
  });

  it('returns null for unknown token', () => {
    const { sqlite, db } = makeDb();
    expect(getReviewByToken(db, 'does-not-exist')).toBeNull();
    sqlite.close();
  });
});

describe('findPendingReviewForBooking', () => {
  it('returns the pending row when one exists', () => {
    const { sqlite, db } = makeDb();
    const c = seedCustomer(db, 'Fred', '+19136666666');
    const rid = seedReview(db, c, {
      status: 'pending',
      bookingId: 42,
      token: 'fred-token',
    });
    const found = findPendingReviewForBooking(db, 42);
    expect(found?.id).toBe(rid);
    sqlite.close();
  });

  it('returns null when booking only has submitted reviews', () => {
    const { sqlite, db } = makeDb();
    const c = seedCustomer(db, 'Fred', '+19136666667');
    seedReview(db, c, {
      status: 'submitted',
      rating: 5,
      bookingId: 43,
      submittedAt: '2026-04-18T00:00:00.000Z',
    });
    const found = findPendingReviewForBooking(db, 43);
    expect(found).toBeNull();
    sqlite.close();
  });
});
