/**
 * Unit tests for landing-page stats queries — Phase 11.
 *
 * These tests use an in-process SQLite database (better-sqlite3 directly)
 * so they don't require a running server. We populate the DB with controlled
 * data and assert the aggregates + gating logic.
 *
 * Test surfaces:
 *   1. Query correctness — sample data → expected aggregates.
 *   2. Cache TTL — second call within 5 min returns cached value; forced
 *      expiry triggers a fresh query.
 *   3. Gating — show_landing_stats=false → enabled=false; review count
 *      below threshold → enabled=false.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb } from '@/db/test-helpers';

// We need to control the module-level db + cache, so we mock @/db to return
// our test database.
let testHandle: ReturnType<typeof createTestDb>;

vi.mock('@/db', () => ({
  getDb: () => testHandle.db,
}));

// Import AFTER mock is in place.
import {
  getLandingStats,
  invalidateLandingStatsCache,
  _setCacheForTest,
  _CACHE_TTL_MS,
} from './queries';

function insertConfig(
  db: Database.Database,
  overrides: Partial<{
    business_founded_year: number;
    show_landing_stats: number;
    min_reviews_for_landing_stats: number;
  }> = {},
): void {
  const {
    business_founded_year = 2023,
    show_landing_stats = 1,
    min_reviews_for_landing_stats = 3,
  } = overrides;

  db.prepare(
    `UPDATE site_config SET business_founded_year = ?, show_landing_stats = ?, min_reviews_for_landing_stats = ?`,
  ).run(business_founded_year, show_landing_stats, min_reviews_for_landing_stats);
}

function insertReview(
  db: Database.Database,
  opts: { rating?: number; status?: string; token?: string; customerId?: number },
): void {
  const {
    rating = 5,
    status = 'submitted',
    token = `tok-${Math.random()}`,
    customerId = 1,
  } = opts;
  db.prepare(
    `INSERT INTO reviews (customer_id, token, status, rating, requested_at, submitted_at)
     VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')`,
  ).run(customerId, token, status, status === 'submitted' ? rating : null);
}

function insertBooking(
  db: Database.Database,
  opts: { customerId?: number; status?: string },
): void {
  const {
    customerId = 1,
    status = 'completed',
  } = opts;
  const token = `btok-${Math.random()}`;
  db.prepare(
    `INSERT INTO bookings (token, customer_id, address_id, address_text, customer_name, customer_phone, service_id, start_at, status, created_at, updated_at)
     VALUES (?, ?, 1, '123 Main St', 'Test Customer', '+19131234567', 1, '2026-01-01T09:00:00Z', ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
  ).run(token, customerId, status);
}

beforeEach(() => {
  testHandle = createTestDb({ inMemory: true });
  // Seed minimal required FK rows
  testHandle.sqlite.exec(`
    INSERT INTO services (name, description) VALUES ('Test', 'test');
    INSERT INTO customers (name, phone, created_at, updated_at)
      VALUES ('Test Customer', '+19131234567', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at)
      VALUES (1, '123 Main St', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  `);
  // Clear cache before each test
  invalidateLandingStatsCache();
});

afterEach(() => {
  testHandle.cleanup();
  invalidateLandingStatsCache();
});

// ---------------------------------------------------------------------------
// 1. Query correctness
// ---------------------------------------------------------------------------

describe('getLandingStats — query correctness', () => {
  it('returns correct aggregates with sample data', () => {
    const currentYear = new Date().getFullYear();
    insertConfig(testHandle.sqlite, { business_founded_year: 2020 });

    // 3 submitted reviews: ratings 4, 5, 5 → avg 4.7
    insertReview(testHandle.sqlite, { rating: 4, token: 't1', customerId: 1 });
    insertReview(testHandle.sqlite, { rating: 5, token: 't2', customerId: 1 });
    insertReview(testHandle.sqlite, { rating: 5, token: 't3', customerId: 1 });

    // 2 completed bookings, 2 distinct customers
    insertBooking(testHandle.sqlite, { customerId: 1, status: 'completed' });
    insertBooking(testHandle.sqlite, { customerId: 1, status: 'completed' });
    // 1 pending booking (should not be counted)
    insertBooking(testHandle.sqlite, { customerId: 1, status: 'pending' });

    const stats = getLandingStats();

    expect(stats.reviewCount).toBe(3);
    expect(stats.avgRating).toBeCloseTo(4.7, 1);
    expect(stats.completedCount).toBe(2);
    expect(stats.yearsInBusiness).toBe(currentYear - 2020);
    expect(stats.enabled).toBe(true);
  });

  it('excludes pending reviews from aggregate', () => {
    insertConfig(testHandle.sqlite, { min_reviews_for_landing_stats: 1 });
    insertReview(testHandle.sqlite, { rating: 5, status: 'submitted', token: 'submitted-1', customerId: 1 });
    insertReview(testHandle.sqlite, { status: 'pending', token: 'pending-1', customerId: 1 });

    const stats = getLandingStats();
    expect(stats.reviewCount).toBe(1);
    expect(stats.avgRating).toBe(5);
  });

  it('returns avgRating null when no submitted reviews exist', () => {
    const stats = getLandingStats();
    expect(stats.avgRating).toBeNull();
    expect(stats.reviewCount).toBe(0);
  });

  it('counts distinct customers served (not bookings)', () => {
    insertConfig(testHandle.sqlite, { min_reviews_for_landing_stats: 1 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1 });
    // Same customer, 2 completed bookings
    insertBooking(testHandle.sqlite, { customerId: 1, status: 'completed' });
    insertBooking(testHandle.sqlite, { customerId: 1, status: 'completed' });

    const stats = getLandingStats();
    expect(stats.completedCount).toBe(2);
    expect(stats.customersServed).toBe(1);
  });

  it('yearsInBusiness is current year minus founded year', () => {
    const currentYear = new Date().getFullYear();
    insertConfig(testHandle.sqlite, { business_founded_year: currentYear - 3 });
    const stats = getLandingStats();
    expect(stats.yearsInBusiness).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Cache TTL
// ---------------------------------------------------------------------------

describe('getLandingStats — cache TTL', () => {
  it('returns cached value on second call within TTL', () => {
    insertConfig(testHandle.sqlite, { min_reviews_for_landing_stats: 1 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1, rating: 5 });

    const first = getLandingStats();
    expect(first.reviewCount).toBe(1);

    // Insert another review WITHOUT invalidating cache
    insertReview(testHandle.sqlite, { token: 'r2', customerId: 1, rating: 4 });

    const second = getLandingStats();
    // Should still be the cached result (1 review)
    expect(second.reviewCount).toBe(1);
    expect(second).toBe(first); // same object reference
  });

  it('fetches fresh data after cache expires', () => {
    insertConfig(testHandle.sqlite, { min_reviews_for_landing_stats: 1 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1, rating: 5 });

    const first = getLandingStats();
    expect(first.reviewCount).toBe(1);

    // Manually expire the cache
    _setCacheForTest({
      value: first,
      expiresAt: Date.now() - 1, // already expired
    });

    // Add a review — should be picked up now
    insertReview(testHandle.sqlite, { token: 'r2', customerId: 1, rating: 4 });

    const second = getLandingStats();
    expect(second.reviewCount).toBe(2);
    expect(second).not.toBe(first);
  });

  it('invalidateLandingStatsCache clears the cache', () => {
    insertConfig(testHandle.sqlite, { min_reviews_for_landing_stats: 1 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1, rating: 5 });

    const first = getLandingStats();
    expect(first.reviewCount).toBe(1);

    invalidateLandingStatsCache();

    insertReview(testHandle.sqlite, { token: 'r2', customerId: 1, rating: 3 });
    const second = getLandingStats();
    expect(second.reviewCount).toBe(2);
  });

  it('cache TTL is 5 minutes', () => {
    expect(_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// 3. Gating logic
// ---------------------------------------------------------------------------

describe('getLandingStats — gating', () => {
  it('enabled=false when show_landing_stats=false, regardless of review count', () => {
    insertConfig(testHandle.sqlite, { show_landing_stats: 0, min_reviews_for_landing_stats: 1 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1, rating: 5 });
    insertReview(testHandle.sqlite, { token: 'r2', customerId: 1, rating: 4 });

    const stats = getLandingStats();
    expect(stats.enabled).toBe(false);
  });

  it('enabled=false when review count is below min threshold', () => {
    insertConfig(testHandle.sqlite, { show_landing_stats: 1, min_reviews_for_landing_stats: 3 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1, rating: 5 });
    insertReview(testHandle.sqlite, { token: 'r2', customerId: 1, rating: 4 });
    // Only 2 reviews, min=3

    const stats = getLandingStats();
    expect(stats.reviewCount).toBe(2);
    expect(stats.enabled).toBe(false);
  });

  it('enabled=true when show_landing_stats=true and review count meets threshold', () => {
    insertConfig(testHandle.sqlite, { show_landing_stats: 1, min_reviews_for_landing_stats: 3 });
    insertReview(testHandle.sqlite, { token: 'r1', customerId: 1, rating: 5 });
    insertReview(testHandle.sqlite, { token: 'r2', customerId: 1, rating: 5 });
    insertReview(testHandle.sqlite, { token: 'r3', customerId: 1, rating: 4 });

    const stats = getLandingStats();
    expect(stats.enabled).toBe(true);
  });

  it('enabled=false when no site_config row exists', () => {
    // The migration seeds a row — delete it to simulate missing config
    testHandle.sqlite.exec(`DELETE FROM site_config`);
    const stats = getLandingStats();
    expect(stats.enabled).toBe(false);
  });
});
