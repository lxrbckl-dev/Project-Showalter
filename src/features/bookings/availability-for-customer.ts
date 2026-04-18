import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, gte, inArray, lte } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { bookings, ACTIVE_HOLD_STATUSES } from '@/db/schema/bookings';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { generateStartTimes, resolveWindows } from '@/features/availability/resolver';
import { parseTimeToMinutes } from '@/features/availability/validate';

/**
 * Customer-facing availability — Phase 5.
 *
 * Composes three layers:
 *
 *   1. The Phase 4 `resolveWindows` + `generateStartTimes` pipeline to
 *      produce raw start-time candidates per day from the weekly template +
 *      per-date overrides.
 *   2. A `min_advance_notice_hours` filter — any candidate earlier than
 *      `now() + min_advance_notice_hours` is hidden.
 *   3. A spacing filter — any candidate within `booking_spacing_minutes` of
 *      an active (pending | accepted) booking's `start_at` is hidden.
 *
 * Returns a per-day payload the public booking UI can render directly.
 *
 * Timezone rule per STACK.md § Conventions:
 *   - `start_at` on `bookings` is always stored as ISO 8601 UTC.
 *   - Labels shown to the customer are computed in `site_config.timezone`
 *     (default America/Chicago). We use `Intl.DateTimeFormat` to render the
 *     local time label — no `tz-date-fns` dependency needed for a single
 *     timezone.
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface CustomerCandidate {
  /** Full ISO 8601 UTC timestamp of the slot start. */
  startAt: string;
  /** Human label like '10:00 AM' — rendered in site_config.timezone. */
  label: string;
}

export interface CustomerDay {
  /** YYYY-MM-DD (in site_config.timezone's calendar). */
  date: string;
  candidates: CustomerCandidate[];
}

/**
 * Convert a date + HH:MM wall-clock + timezone into an ISO 8601 UTC string.
 *
 * Built-in JS has no timezone-aware constructor, so we iterate: assume UTC,
 * render it back in the target timezone, and shift by the error. One pass
 * is enough for all timezones that don't span a DST transition mid-slot;
 * in the single-timezone Kansas City (America/Chicago) case this is simple
 * and exact.
 */
export function localWallClockToUtcIso(
  dateIso: string, // YYYY-MM-DD
  hhmm: string, // 'HH:MM'
  timezone: string,
): string {
  const [year, month, day] = dateIso.split('-').map((p) => Number.parseInt(p, 10));
  const [hour, minute] = hhmm.split(':').map((p) => Number.parseInt(p, 10));

  // Start with naive UTC for the wall time.
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Render that naive UTC instant *as if viewed from* the target timezone.
  // The offset is the delta between the naive wall time and the timezone's
  // wall time at that instant.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(naive));

  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const rendered = Date.UTC(
    Number.parseInt(byType.year, 10),
    Number.parseInt(byType.month, 10) - 1,
    Number.parseInt(byType.day, 10),
    Number.parseInt(byType.hour, 10),
    Number.parseInt(byType.minute, 10),
    Number.parseInt(byType.second, 10),
  );

  // `naive` is the wall time we wanted; `rendered` is what that UTC instant
  // looks like in the target tz. The offset is the amount to subtract.
  const offset = rendered - naive;
  return new Date(naive - offset).toISOString();
}

/**
 * Format a UTC ISO timestamp as a human time label in the given timezone.
 *
 *   '2026-04-18T15:30:00.000Z' + 'America/Chicago' → '10:30 AM'
 */
export function formatTimeLabel(isoUtc: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoUtc));
}

/**
 * Produce the YYYY-MM-DD strings to show in the customer-facing picker.
 *
 * Starts at "today" in the site timezone (not UTC — a customer opening the
 * page at 11 PM CST on Friday shouldn't see Saturday missing because UTC
 * is already past midnight).
 */
export function buildDateHorizon(
  nowUtc: Date,
  timezone: string,
  horizonWeeks: number,
): string[] {
  const startDate = formatDateInTz(nowUtc, timezone);
  const [year, month, day] = startDate.split('-').map((p) => Number.parseInt(p, 10));

  const out: string[] = [];
  const days = horizonWeeks * 7;
  // Use UTC-midnight anchoring so .setUTCDate() walks calendar days without
  // tripping on DST (the local calendar rollover itself is computed from
  // each iteration's midnight-UTC, which formatDateInTz then reinterprets).
  for (let i = 0; i < days; i++) {
    const dt = new Date(Date.UTC(year, month - 1, day));
    dt.setUTCDate(dt.getUTCDate() + i);
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
        dt.getUTCDate(),
      ).padStart(2, '0')}`,
    );
  }
  return out;
}

function formatDateInTz(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export interface AvailabilityForCustomerOptions {
  /** Defaults to `new Date()`; override in tests. */
  now?: Date;
  /** Override the computed UTC horizon start (advanced/testing). */
  dates?: string[];
}

/**
 * Compute the full availability payload for the public picker.
 *
 * Complexity is O(days × candidates-per-day × held-bookings). In practice
 * days ≤ 28 and candidates ≤ 24 per day; held bookings in the horizon are
 * usually < 20. Well within the single-query budget.
 */
export function availabilityForCustomer(
  db: Db,
  opts: AvailabilityForCustomerOptions = {},
): CustomerDay[] {
  const now = opts.now ?? new Date();

  // Read site-config knobs (single row).
  const cfgRows = db
    .select({
      bookingHorizonWeeks: siteConfigTable.bookingHorizonWeeks,
      minAdvanceNoticeHours: siteConfigTable.minAdvanceNoticeHours,
      startTimeIncrementMinutes: siteConfigTable.startTimeIncrementMinutes,
      bookingSpacingMinutes: siteConfigTable.bookingSpacingMinutes,
      timezone: siteConfigTable.timezone,
    })
    .from(siteConfigTable)
    .limit(1)
    .all();
  const cfg = cfgRows[0];
  if (!cfg) return [];

  const horizonDates =
    opts.dates ?? buildDateHorizon(now, cfg.timezone, cfg.bookingHorizonWeeks);

  if (horizonDates.length === 0) return [];

  // Earliest visible slot per advance-notice rule (in UTC).
  const earliestUtc = new Date(
    now.getTime() + cfg.minAdvanceNoticeHours * 3_600_000,
  );

  // Fetch all active (pending | accepted) bookings that could affect any
  // day in the horizon. Widen the window by ±spacing to catch slots whose
  // buffer reaches into the horizon.
  const spacingMs = cfg.bookingSpacingMinutes * 60_000;
  const horizonStart = localWallClockToUtcIso(horizonDates[0], '00:00', cfg.timezone);
  const horizonEnd = localWallClockToUtcIso(
    horizonDates[horizonDates.length - 1],
    '23:59',
    cfg.timezone,
  );
  const winStart = new Date(
    new Date(horizonStart).getTime() - spacingMs,
  ).toISOString();
  const winEnd = new Date(
    new Date(horizonEnd).getTime() + spacingMs,
  ).toISOString();

  const heldRows = db
    .select({ startAt: bookings.startAt })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, [...ACTIVE_HOLD_STATUSES]),
        gte(bookings.startAt, winStart),
        lte(bookings.startAt, winEnd),
      ),
    )
    .all();
  const heldUtcMs = heldRows.map((r) => new Date(r.startAt).getTime());

  const out: CustomerDay[] = [];
  for (const date of horizonDates) {
    const windows = resolveWindows(date, db);
    const candidates = generateStartTimes(
      windows,
      cfg.startTimeIncrementMinutes,
    );

    const dayCandidates: CustomerCandidate[] = [];
    for (const hhmm of candidates) {
      const startAtUtc = localWallClockToUtcIso(date, hhmm, cfg.timezone);
      const startMs = new Date(startAtUtc).getTime();

      // Filter 1: advance-notice.
      if (startMs < earliestUtc.getTime()) continue;

      // Filter 2: spacing buffer against any active booking.
      const tooClose = heldUtcMs.some(
        (heldMs) => Math.abs(heldMs - startMs) < spacingMs,
      );
      if (tooClose) continue;

      dayCandidates.push({
        startAt: startAtUtc,
        label: formatTimeLabel(startAtUtc, cfg.timezone),
      });
    }

    out.push({ date, candidates: dayCandidates });
  }

  return out;
}

/**
 * Pure-function variant used by unit tests — lets callers pre-build the
 * `windows`/`held` lists instead of going through the DB. Exported so we
 * can exhaustively test the three filters without spinning up SQLite.
 */
export function filterCandidatesPure(opts: {
  date: string; // YYYY-MM-DD
  windows: Array<{ startTime: string; endTime: string }>;
  incrementMinutes: number;
  spacingMinutes: number;
  minAdvanceNoticeHours: number;
  heldUtcIso: string[];
  now: Date;
  timezone: string;
}): CustomerCandidate[] {
  const {
    date,
    windows,
    incrementMinutes,
    spacingMinutes,
    minAdvanceNoticeHours,
    heldUtcIso,
    now,
    timezone,
  } = opts;

  const earliest = now.getTime() + minAdvanceNoticeHours * 3_600_000;
  const spacingMs = spacingMinutes * 60_000;
  const heldMs = heldUtcIso.map((iso) => new Date(iso).getTime());
  // Touch parseTimeToMinutes so it stays exported (used indirectly in the
  // generator; importing keeps this module from collapsing to dead-code
  // during refactors).
  void parseTimeToMinutes;

  const candidates = generateStartTimes(windows, incrementMinutes);
  const out: CustomerCandidate[] = [];
  for (const hhmm of candidates) {
    const startAt = localWallClockToUtcIso(date, hhmm, timezone);
    const startMs = new Date(startAt).getTime();
    if (startMs < earliest) continue;
    if (heldMs.some((h) => Math.abs(h - startMs) < spacingMs)) continue;
    out.push({ startAt, label: formatTimeLabel(startAt, timezone) });
  }
  return out;
}

/**
 * Convenience: true iff there is at least one open slot anywhere in the
 * horizon. Powers the zero-availability empty state on the picker UI.
 */
export function hasAnyAvailability(days: CustomerDay[]): boolean {
  return days.some((d) => d.candidates.length > 0);
}

// Re-export for `queries.ts` consumers if they need to import from a single
// location; keeps the public-API surface of the module small.
export { bookings as bookingsTable };

/**
 * Guard — used to decide whether to reject a stale `start_at` at submit
 * time. A client that held the page open for hours would otherwise race
 * against the `bookings_active_start` partial UNIQUE index every time.
 * We pre-validate here for a nicer error path.
 */
export function isStartAtStillAvailable(
  startAtUtcIso: string,
  db: Db,
  now: Date = new Date(),
): boolean {
  const cfgRows = db
    .select({
      minAdvanceNoticeHours: siteConfigTable.minAdvanceNoticeHours,
      bookingSpacingMinutes: siteConfigTable.bookingSpacingMinutes,
    })
    .from(siteConfigTable)
    .limit(1)
    .all();
  const cfg = cfgRows[0];
  if (!cfg) return false;

  const startMs = new Date(startAtUtcIso).getTime();
  const earliest = now.getTime() + cfg.minAdvanceNoticeHours * 3_600_000;
  if (startMs < earliest) return false;

  const spacingMs = cfg.bookingSpacingMinutes * 60_000;
  const winStart = new Date(startMs - spacingMs).toISOString();
  const winEnd = new Date(startMs + spacingMs).toISOString();

  // Reject if ANY active booking falls inside the [start-spacing, start+spacing]
  // window. The exact equality case is also caught by the partial UNIQUE
  // index, but rejecting pre-insert gives a friendlier error.
  const rows = db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, [...ACTIVE_HOLD_STATUSES]),
        gte(bookings.startAt, winStart),
        lte(bookings.startAt, winEnd),
      ),
    )
    .limit(1)
    .all();
  return rows.length === 0;
}
