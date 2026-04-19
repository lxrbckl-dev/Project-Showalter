/**
 * Landing-page stats queries — Phase 11.
 *
 * getLandingStats() returns aggregate stats for the public StatsBand component
 * along with an `enabled` flag that reflects both the admin toggle and the
 * min-review gate.
 *
 * Caching: a module-level in-memory cache with a 5-minute TTL avoids hitting
 * SQLite on every page request. The cache is invalidated by calling
 * invalidateLandingStatsCache() (called from decide actions when bookings move
 * to/from completed status).
 */

import { getDb } from '@/db';
import { siteConfig } from '@/db/schema/site-config';
import { reviews } from '@/db/schema/reviews';
import { bookings } from '@/db/schema/bookings';
import { avg, count, countDistinct, eq } from 'drizzle-orm';
import { calculateAge } from '@/lib/age';

export interface LandingStats {
  /** Average review rating, rounded to 1 decimal place. Null when no reviews. */
  avgRating: number | null;
  /** Count of submitted reviews. */
  reviewCount: number;
  /** Count of bookings with status='completed'. */
  completedCount: number;
  /** Count of distinct customer_id values with at least one completed booking. */
  customersServed: number;
  /** Current year − site_config.business_founded_year. */
  yearsInBusiness: number;
  /**
   * Whether the band should be rendered. False when show_landing_stats=false
   * OR when reviewCount < min_reviews_for_landing_stats.
   */
  enabled: boolean;
}

interface CacheEntry {
  value: LandingStats;
  expiresAt: number; // ms since epoch
}

/** 5-minute TTL in milliseconds. */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: CacheEntry | null = null;

/**
 * Invalidate the in-memory cache. Call this whenever bookings move
 * to/from completed status (e.g. from decide actions).
 */
export function invalidateLandingStatsCache(): void {
  cache = null;
}

/**
 * Fetch landing stats, using the in-memory cache when valid.
 *
 * Reads synchronously from SQLite (better-sqlite3) — safe to call from
 * server components without awaiting.
 */
export function getLandingStats(): LandingStats {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const value = _fetchLandingStats();
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

function _fetchLandingStats(): LandingStats {
  const db = getDb();

  // --- site_config ---
  const configRows = db.select().from(siteConfig).limit(1).all();
  const config = configRows[0];

  const showLandingStats = config ? Boolean(config.showLandingStats) : false;
  const minReviews = config?.minReviewsForLandingStats ?? 3;

  // Years in business: prefer businessStartDate (calendar-correct) over founded year.
  let yearsInBusiness: number;
  if (config?.businessStartDate) {
    // calculateAge treats any ISO YYYY-MM-DD as a start date and returns
    // full elapsed years — the same semantics we need here.
    const years = calculateAge(config.businessStartDate, {
      timezone: config.timezone ?? 'America/Chicago',
    });
    yearsInBusiness = Math.max(0, years ?? 0);
  } else {
    const businessFoundedYear = config?.businessFoundedYear ?? new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    yearsInBusiness = Math.max(0, currentYear - businessFoundedYear);
  }

  // --- review aggregates ---
  const reviewAgg = db
    .select({
      avgRating: avg(reviews.rating),
      reviewCount: count(reviews.id),
    })
    .from(reviews)
    .where(eq(reviews.status, 'submitted'))
    .all()[0];

  const rawAvg = reviewAgg?.avgRating;
  const avgRating =
    rawAvg !== null && rawAvg !== undefined
      ? Math.round(Number(rawAvg) * 10) / 10
      : null;
  const reviewCount = Number(reviewAgg?.reviewCount ?? 0);

  // --- completed booking counts ---
  const bookingAgg = db
    .select({
      completedCount: count(bookings.id),
      customersServed: countDistinct(bookings.customerId),
    })
    .from(bookings)
    .where(eq(bookings.status, 'completed'))
    .all()[0];

  const computedCompletedCount = Number(bookingAgg?.completedCount ?? 0);
  const computedCustomersServed = Number(bookingAgg?.customersServed ?? 0);

  // Apply admin overrides — fall back to computed values when override is unset.
  const completedCount =
    config?.statsJobsCompletedOverride != null
      ? config.statsJobsCompletedOverride
      : computedCompletedCount;
  const customersServed =
    config?.statsCustomersServedOverride != null
      ? config.statsCustomersServedOverride
      : computedCustomersServed;

  // --- gating ---
  const enabled = showLandingStats && reviewCount >= minReviews;

  return {
    avgRating,
    reviewCount,
    completedCount,
    customersServed,
    yearsInBusiness,
    enabled,
  };
}

// Export cache internals for unit testing only.
export { cache as _cache, CACHE_TTL_MS as _CACHE_TTL_MS };
export function _setCacheForTest(entry: CacheEntry | null): void {
  cache = entry;
}
