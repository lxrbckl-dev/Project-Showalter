/**
 * StatsBand — server component that renders a 4-card aggregate stats strip
 * on the public landing page. Phase 11.
 *
 * Cards:
 *   1. ⭐ Average rating
 *   2. Jobs completed
 *   3. Customers served
 *   4. Years in business
 *
 * Visibility gating is handled by getLandingStats().enabled:
 *   - show_landing_stats=false  → renders nothing
 *   - reviewCount < min_reviews_for_landing_stats → renders nothing
 *
 * Server component reads from the in-memory cache or SQLite. The cells
 * themselves (StatCard) are client components so they can count-up from
 * 0 → target on scroll-into-view.
 */

import { getLandingStats } from '@/features/stats/queries';
import { StatCard } from './StatCard';

export function StatsBand() {
  const stats = getLandingStats();

  if (!stats.enabled) return null;

  const yearsLabel =
    stats.yearsInBusiness === 1 ? 'Year in Business' : 'Years in Business';

  return (
    <div
      aria-label="At a glance"
      className="mx-auto grid max-w-4xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 sm:gap-y-0"
    >
      <StatCard
        prefix="⭐ "
        value={stats.avgRating}
        decimals={1}
        label="Avg Rating"
      />
      <StatCard value={stats.completedCount} label="Jobs Completed" />
      <StatCard value={stats.customersServed} label="Customers Served" />
      <StatCard value={stats.yearsInBusiness} label={yearsLabel} />
    </div>
  );
}
