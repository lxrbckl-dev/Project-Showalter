import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import {
  availabilityOverrideWindows,
  availabilityOverrides,
  weeklyTemplateWindows,
} from '@/db/schema/availability';
import type * as schema from '@/db/schema';
import { formatMinutesAsTime, parseTimeToMinutes } from './validate';

/**
 * Availability resolver — pure domain helpers plus one DB-backed function
 * (`resolveWindows`). Implements the precedence rules documented in
 * STACK.md § "Availability model":
 *
 *   1. If a `availability_overrides` row exists for the date AND mode='closed'
 *      → return [] (the date is explicitly closed).
 *   2. If mode='open' → return the `availability_override_windows` for that
 *      date (override-defined windows REPLACE the template for that date).
 *   3. Otherwise → fall back to the `weekly_template_windows` matching the
 *      date's `day_of_week`. Empty fallback = closed (opt-in default).
 *
 * All returned windows are sorted by start time for deterministic output —
 * important for unit-test expectations and for the start-time generator
 * which assumes non-overlapping windows are processed in order.
 */

export type Window = { startTime: string; endTime: string };

type Db = BetterSQLite3Database<typeof schema>;

/**
 * JavaScript's `Date.getUTCDay()` returns 0=Sunday … 6=Saturday, which
 * matches our `day_of_week` convention exactly. We parse the YYYY-MM-DD
 * string as a UTC date to avoid local-timezone drift — the weekday of a
 * calendar date is timezone-independent when the date is rendered as a
 * wall-clock string.
 */
export function dayOfWeek(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Resolve the open windows for a specific date by applying the precedence
 * rules from STACK.md.
 *
 * The function is synchronous — better-sqlite3 is blocking — but we keep
 * the signature `Promise`-compatible (returning a plain value) so callers
 * can swap in an async backend without churn at the call site.
 */
export function resolveWindows(dateIso: string, db: Db): Window[] {
  // Step 1: is there a date override?
  const overrideRows = db
    .select()
    .from(availabilityOverrides)
    .where(eq(availabilityOverrides.date, dateIso))
    .all();
  const override = overrideRows[0];

  if (override) {
    if (override.mode === 'closed') {
      return [];
    }
    if (override.mode === 'open') {
      const rows = db
        .select({
          startTime: availabilityOverrideWindows.startTime,
          endTime: availabilityOverrideWindows.endTime,
        })
        .from(availabilityOverrideWindows)
        .where(eq(availabilityOverrideWindows.date, dateIso))
        .orderBy(asc(availabilityOverrideWindows.startTime))
        .all();
      return rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
    }
    // Unknown mode — treat as no override (defensive; DB schema restricts
    // values at write time via the action validator).
  }

  // Step 2: weekly template fallback.
  const dow = dayOfWeek(dateIso);
  const rows = db
    .select({
      startTime: weeklyTemplateWindows.startTime,
      endTime: weeklyTemplateWindows.endTime,
    })
    .from(weeklyTemplateWindows)
    .where(eq(weeklyTemplateWindows.dayOfWeek, dow))
    .orderBy(asc(weeklyTemplateWindows.startTime))
    .all();
  return rows.map((r) => ({ startTime: r.startTime, endTime: r.endTime }));
}

/**
 * Generate candidate start times over a list of windows at the given
 * increment. A candidate is kept only if `start + incrementMinutes <= end`,
 * which is the "discard slack" rule from STACK.md:
 *
 *   Saturday 10:00–14:00 with 30-minute increment →
 *   10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30
 *
 * 13:30 is kept because 13:30 + 30 = 14:00 exactly (fits). 14:00 is
 * discarded because it would require the window to extend past its end.
 *
 * The resulting list is flat across all windows, sorted by time.
 */
export function generateStartTimes(
  windows: Window[],
  incrementMinutes: number,
): string[] {
  if (incrementMinutes <= 0) {
    throw new Error(
      `incrementMinutes must be > 0 (got ${incrementMinutes})`,
    );
  }
  const out: string[] = [];
  for (const w of windows) {
    const start = parseTimeToMinutes(w.startTime);
    const end = parseTimeToMinutes(w.endTime);
    for (let t = start; t + incrementMinutes <= end; t += incrementMinutes) {
      out.push(formatMinutesAsTime(t));
    }
  }
  out.sort();
  return out;
}
