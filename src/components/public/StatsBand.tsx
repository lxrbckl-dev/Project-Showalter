/**
 * StatsBand — server component that renders a 4-card aggregate stats strip
 * on the public landing page. Phase 11.
 *
 * Cards:
 *   1. ⭐ Average rating  + "N reviews" subtitle
 *   2. Jobs completed
 *   3. Customers served
 *   4. Years in business
 *
 * Visibility gating is handled by getLandingStats().enabled:
 *   - show_landing_stats=false  → renders nothing
 *   - reviewCount < min_reviews_for_landing_stats → renders nothing
 *
 * This is a server component (no 'use client'). getLandingStats() reads
 * synchronously from the in-memory cache or SQLite.
 */

import { getLandingStats } from '@/features/stats/queries';

interface StatCardProps {
  /** Primary value displayed large (e.g. "4.8" or "42"). */
  value: string;
  /** Descriptive label below the value. */
  label: string;
  /** Smaller subtitle text, optional (e.g. "27 reviews"). */
  subtitle?: string;
}

function StatCard({ value, label, subtitle }: StatCardProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
      <span className="flex h-10 items-center text-4xl font-extrabold leading-none tracking-tight text-[#6C9630]">
        {value}
      </span>
      <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </span>
      {subtitle && (
        <span className="mt-0.5 text-xs text-gray-400">{subtitle}</span>
      )}
    </div>
  );
}

export function StatsBand() {
  const stats = getLandingStats();

  if (!stats.enabled) return null;

  const avgRatingDisplay =
    stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—';

  const yearsLabel =
    stats.yearsInBusiness === 1 ? 'Year in Business' : 'Years in Business';

  return (
    <div
      aria-label="At a glance"
      className="mx-auto grid max-w-4xl grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 sm:gap-y-0"
    >
      <StatCard
        value={`⭐ ${avgRatingDisplay}`}
        label="Avg Rating"
      />
      <StatCard
        value={String(stats.completedCount)}
        label="Jobs Completed"
      />
      <StatCard
        value={String(stats.customersServed)}
        label="Customers Served"
      />
      <StatCard
        value={String(stats.yearsInBusiness)}
        label={yearsLabel}
      />
    </div>
  );
}
