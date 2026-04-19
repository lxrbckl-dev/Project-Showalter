import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { reviews } from '@/db/schema/reviews';
import { reviewPhotos } from '@/db/schema/review-photos';
import { sitePhotos } from '@/db/schema/site-photos';
import { siteConfig } from '@/db/schema/site-config';
import { submitReviewCore, submitInputSchema } from './submit-core';

/**
 * Unit tests for submitReviewCore — Phase 9.
 *
 * Covers:
 *   - Zod validation boundaries
 *   - Unknown token → not_found
 *   - Second submit on the same token → already_submitted
 *   - Happy path: review row flips to submitted, review_photos rows inserted
 *   - Auto-publish rule firing:
 *     * rating < min_rating_for_auto_publish → no site_photos write
 *     * rating >= min but auto_publish flag off → no site_photos write
 *     * rating >= min AND auto_publish flag on AND photos present → write
 *   - source_review_id is populated on auto-published site_photos rows
 */

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
    CREATE TABLE site_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      file_path TEXT NOT NULL, caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      source_review_id INTEGER,
      source_review_rating INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE site_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT,
      date_of_birth TEXT,
      owner_first_name TEXT,
      sms_template TEXT,
      email_template_subject TEXT,
      email_template_body TEXT,
      booking_horizon_weeks INTEGER NOT NULL DEFAULT 4,
      min_advance_notice_hours INTEGER NOT NULL DEFAULT 36,
      start_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
      booking_spacing_minutes INTEGER NOT NULL DEFAULT 60,
      max_booking_photos INTEGER NOT NULL DEFAULT 3,
      booking_photo_max_bytes INTEGER NOT NULL DEFAULT 10485760,
      photo_retention_days_after_resolve INTEGER NOT NULL DEFAULT 30,
      timezone TEXT NOT NULL DEFAULT 'America/Chicago',
      business_founded_year INTEGER NOT NULL DEFAULT 2023,
      site_title TEXT NOT NULL DEFAULT 'Sawyer Showalter Service',
      show_landing_stats INTEGER NOT NULL DEFAULT 1,
      min_reviews_for_landing_stats INTEGER NOT NULL DEFAULT 3,
      min_rating_for_auto_publish INTEGER NOT NULL DEFAULT 4,
      auto_publish_top_review_photos INTEGER NOT NULL DEFAULT 1,
      template_confirmation_email TEXT, template_confirmation_sms TEXT,
      template_decline_email TEXT, template_decline_sms TEXT,
      template_review_request_email TEXT, template_review_request_sms TEXT,
      stats_jobs_completed_override INTEGER,
      stats_customers_served_override INTEGER,
      business_start_date TEXT
    );
    INSERT INTO site_config (id) VALUES (1);
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

function seedReview(
  db: Db,
  overrides: Partial<{
    status: 'pending' | 'submitted';
    rating: number | null;
    token: string;
    customerId: number;
    bookingId: number | null;
  }> = {},
): number {
  // Ensure a customer row exists.
  db.insert(schema.customers)
    .values({
      name: 'Jane',
      phone: `+1913309${Math.floor(Math.random() * 10_000)
        .toString()
        .padStart(4, '0')}`,
      email: null,
      notes: null,
      createdAt: '2026-04-16T00:00:00.000Z',
      updatedAt: '2026-04-16T00:00:00.000Z',
      lastBookingAt: null,
    })
    .onConflictDoNothing()
    .run();
  const c = db
    .select()
    .from(schema.customers)
    .orderBy(schema.customers.id)
    .all()[0];

  const rows = db
    .insert(reviews)
    .values({
      bookingId: overrides.bookingId ?? null,
      customerId: overrides.customerId ?? c.id,
      token: overrides.token ?? `tok-${Math.random().toString(36).slice(2)}`,
      status: overrides.status ?? 'pending',
      rating: overrides.rating ?? null,
      reviewText: null,
      requestedAt: '2026-04-17T00:00:00.000Z',
      submittedAt: null,
    })
    .returning()
    .all();
  return rows[0].id;
}

function setConfig(
  db: Db,
  patch: Partial<{
    minRatingForAutoPublish: number;
    autoPublishTopReviewPhotos: number;
  }>,
): void {
  db.update(siteConfig).set(patch).where(eq(siteConfig.id, 1)).run();
}

describe('submitInputSchema', () => {
  it('accepts rating 1..5 and trims text', () => {
    const out = submitInputSchema.parse({ rating: 5, reviewText: '  great  ' });
    expect(out.rating).toBe(5);
    expect(out.reviewText).toBe('great');
  });

  it('rejects rating < 1 or > 5', () => {
    expect(submitInputSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(submitInputSchema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it('rejects non-integer ratings', () => {
    expect(submitInputSchema.safeParse({ rating: 3.5 }).success).toBe(false);
  });

  it('converts blank review_text to null', () => {
    const out = submitInputSchema.parse({ rating: 4, reviewText: '   ' });
    expect(out.reviewText).toBeNull();
  });
});

describe('submitReviewCore', () => {
  let sqlite: Database.Database;
  let db: Db;
  beforeEach(() => {
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
  });

  it('unknown token → not_found', () => {
    const result = submitReviewCore({
      token: 'does-not-exist',
      input: { rating: 5 },
      photos: [],
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
    sqlite.close();
  });

  it('happy path: pending → submitted, review_photos inserted', () => {
    const id = seedReview(db, { token: 'tok-ok' });
    const result = submitReviewCore({
      token: 'tok-ok',
      input: { rating: 5, reviewText: 'Excellent!' },
      photos: [
        {
          filePath: 'reviews/1/a.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1234,
        },
      ],
      db,
      now: new Date('2026-04-18T10:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.review.status).toBe('submitted');
      expect(result.review.rating).toBe(5);
      expect(result.review.reviewText).toBe('Excellent!');
      expect(result.review.submittedAt).toBe('2026-04-18T10:00:00.000Z');
    }
    const photos = db
      .select()
      .from(reviewPhotos)
      .where(eq(reviewPhotos.reviewId, id))
      .all();
    expect(photos).toHaveLength(1);
    sqlite.close();
  });

  it('already submitted → already_submitted (idempotency)', () => {
    seedReview(db, { token: 'tok-idem', status: 'submitted', rating: 4 });
    const result = submitReviewCore({
      token: 'tok-idem',
      input: { rating: 5 },
      photos: [],
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('already_submitted');
    sqlite.close();
  });

  it('invalid input (rating 0) → invalid_input', () => {
    seedReview(db, { token: 'tok-bad' });
    const result = submitReviewCore({
      token: 'tok-bad',
      input: { rating: 0 },
      photos: [],
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('invalid_input');
    sqlite.close();
  });

  it('auto-publish: rating 3 (below default min of 4) → no site_photos insert', () => {
    const id = seedReview(db, { token: 'tok-3star' });
    submitReviewCore({
      token: 'tok-3star',
      input: { rating: 3 },
      photos: [
        { filePath: 'reviews/1/x.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
      ],
      db,
    });
    const published = db
      .select()
      .from(sitePhotos)
      .where(eq(sitePhotos.sourceReviewId, id))
      .all();
    expect(published).toHaveLength(0);
    sqlite.close();
  });

  it('auto-publish: rating 5 but flag disabled → no site_photos insert', () => {
    setConfig(db, { autoPublishTopReviewPhotos: 0 });
    const id = seedReview(db, { token: 'tok-5off' });
    submitReviewCore({
      token: 'tok-5off',
      input: { rating: 5 },
      photos: [
        { filePath: 'reviews/1/x.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
      ],
      db,
    });
    const published = db
      .select()
      .from(sitePhotos)
      .where(eq(sitePhotos.sourceReviewId, id))
      .all();
    expect(published).toHaveLength(0);
    sqlite.close();
  });

  it('auto-publish: rating 4 (equals default min) + flag on → site_photos written', () => {
    const id = seedReview(db, { token: 'tok-4star' });
    const result = submitReviewCore({
      token: 'tok-4star',
      input: { rating: 4, reviewText: 'Great service!' },
      photos: [
        { filePath: 'reviews/1/a.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
        { filePath: 'reviews/1/b.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
      ],
      db,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.autoPublished).toBe(true);
    const published = db
      .select()
      .from(sitePhotos)
      .where(eq(sitePhotos.sourceReviewId, id))
      .all();
    expect(published).toHaveLength(2);
    expect(published[0].active).toBe(1);
    expect(published[0].sourceReviewId).toBe(id);
    // Review text is carried into caption for every promoted photo
    expect(published[0].caption).toBe('Great service!');
    expect(published[1].caption).toBe('Great service!');
    // sort_order is strictly increasing
    expect(published[1].sortOrder).toBeGreaterThan(published[0].sortOrder);
    sqlite.close();
  });

  it('auto-publish: no review text → caption is null on promoted photo', () => {
    const id = seedReview(db, { token: 'tok-nocaption' });
    submitReviewCore({
      token: 'tok-nocaption',
      input: { rating: 5 },
      photos: [
        { filePath: 'reviews/1/c.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
      ],
      db,
    });
    const published = db
      .select()
      .from(sitePhotos)
      .where(eq(sitePhotos.sourceReviewId, id))
      .all();
    expect(published).toHaveLength(1);
    expect(published[0].caption).toBeNull();
    sqlite.close();
  });

  it('auto-publish: custom threshold min=5 — 4-star review does not publish', () => {
    setConfig(db, { minRatingForAutoPublish: 5 });
    const id = seedReview(db, { token: 'tok-4under5' });
    submitReviewCore({
      token: 'tok-4under5',
      input: { rating: 4 },
      photos: [
        { filePath: 'reviews/1/a.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
      ],
      db,
    });
    const published = db
      .select()
      .from(sitePhotos)
      .where(eq(sitePhotos.sourceReviewId, id))
      .all();
    expect(published).toHaveLength(0);
    sqlite.close();
  });

  it('auto-publish: no photos → nothing published even at 5 stars', () => {
    const id = seedReview(db, { token: 'tok-nophoto' });
    const result = submitReviewCore({
      token: 'tok-nophoto',
      input: { rating: 5 },
      photos: [],
      db,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.autoPublished).toBe(false);
    const published = db
      .select()
      .from(sitePhotos)
      .where(eq(sitePhotos.sourceReviewId, id))
      .all();
    expect(published).toHaveLength(0);
    sqlite.close();
  });
});
