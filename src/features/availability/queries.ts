import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  availabilityOverrideWindows,
  availabilityOverrides,
  weeklyTemplateWindows,
  type AvailabilityOverrideRow,
  type AvailabilityOverrideWindowRow,
  type WeeklyTemplateWindowRow,
} from '@/db/schema/availability';

/**
 * Read-side queries consumed by the admin schedule page. Keeping these in
 * their own module (vs. inline inside `page.tsx`) keeps `src/app/**` free
 * of DB access per ARCHITECTURE.md invariant #1.
 */

export type TemplateByDay = Record<number, WeeklyTemplateWindowRow[]>;

/**
 * Returns the full weekly template grouped by day_of_week (0..6). Each
 * weekday's windows are ordered by start_time. Weekdays with no windows
 * map to an empty array so the UI can render "closed" uniformly.
 */
export function listWeeklyTemplate(): TemplateByDay {
  const db = getDb();
  const rows = db
    .select()
    .from(weeklyTemplateWindows)
    .orderBy(asc(weeklyTemplateWindows.dayOfWeek), asc(weeklyTemplateWindows.startTime))
    .all();

  const out: TemplateByDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of rows) {
    out[r.dayOfWeek].push(r);
  }
  return out;
}

export type OverrideWithWindows = AvailabilityOverrideRow & {
  windows: AvailabilityOverrideWindowRow[];
};

/**
 * List every override row, sorted by date ascending, with its child
 * override_windows inlined. One query per table — adequate for the
 * small row counts we expect (overrides accumulate slowly).
 */
export function listOverrides(): OverrideWithWindows[] {
  const db = getDb();
  const overrides = db
    .select()
    .from(availabilityOverrides)
    .orderBy(asc(availabilityOverrides.date))
    .all();
  const windows = db
    .select()
    .from(availabilityOverrideWindows)
    .orderBy(
      asc(availabilityOverrideWindows.date),
      asc(availabilityOverrideWindows.startTime),
    )
    .all();

  const byDate = new Map<string, AvailabilityOverrideWindowRow[]>();
  for (const w of windows) {
    const list = byDate.get(w.date) ?? [];
    list.push(w);
    byDate.set(w.date, list);
  }

  return overrides.map((o) => ({
    ...o,
    windows: byDate.get(o.date) ?? [],
  }));
}

/**
 * Return the single override (and its windows) for a specific date, or
 * null if no override exists. Useful for the "selected date" panel in the
 * admin UI, though the page-level query currently uses `listOverrides`.
 */
export function getOverride(date: string): OverrideWithWindows | null {
  const db = getDb();
  const o = db
    .select()
    .from(availabilityOverrides)
    .where(eq(availabilityOverrides.date, date))
    .all();
  if (!o[0]) return null;
  const windows = db
    .select()
    .from(availabilityOverrideWindows)
    .where(eq(availabilityOverrideWindows.date, date))
    .orderBy(asc(availabilityOverrideWindows.startTime))
    .all();
  return { ...o[0], windows };
}
