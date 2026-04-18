import { describe, expect, it } from 'vitest';
import {
  buildDateHorizon,
  filterCandidatesPure,
  formatTimeLabel,
  hasAnyAvailability,
  localWallClockToUtcIso,
} from './availability-for-customer';

/**
 * Unit tests for the customer-availability composition layer. The DB-backed
 * `availabilityForCustomer` function is exercised via the E2E booking flow
 * (tests/e2e/booking.spec.ts); the pure helpers here cover the three
 * filters + timezone conversions, which are the tricky parts.
 */

describe('localWallClockToUtcIso', () => {
  it('converts America/Chicago wall time to UTC (standard time)', () => {
    // Jan 15 2026 is in CST (UTC-6). 09:00 local → 15:00 UTC.
    expect(localWallClockToUtcIso('2026-01-15', '09:00', 'America/Chicago')).toBe(
      '2026-01-15T15:00:00.000Z',
    );
  });

  it('converts America/Chicago wall time to UTC (DST)', () => {
    // July 15 2026 is CDT (UTC-5). 09:00 local → 14:00 UTC.
    expect(localWallClockToUtcIso('2026-07-15', '09:00', 'America/Chicago')).toBe(
      '2026-07-15T14:00:00.000Z',
    );
  });

  it('UTC timezone is a no-op', () => {
    expect(localWallClockToUtcIso('2026-04-18', '10:30', 'UTC')).toBe(
      '2026-04-18T10:30:00.000Z',
    );
  });
});

describe('formatTimeLabel', () => {
  it('renders a US-style 12-hour label in the target timezone', () => {
    const label = formatTimeLabel('2026-04-18T15:30:00.000Z', 'America/Chicago');
    // April is CDT (UTC-5) → 10:30 AM local.
    expect(label).toBe('10:30 AM');
  });
});

describe('buildDateHorizon', () => {
  it('builds N weeks of consecutive YYYY-MM-DD dates from "today" in tz', () => {
    const now = new Date('2026-04-18T05:00:00Z'); // midnight local (CDT)
    const dates = buildDateHorizon(now, 'America/Chicago', 1);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-04-18');
    expect(dates[6]).toBe('2026-04-24');
  });

  it('anchors on the site-timezone calendar day, not UTC', () => {
    // 2026-04-19 00:30 UTC is still 2026-04-18 in America/Chicago (-5 CDT).
    const now = new Date('2026-04-19T00:30:00Z');
    const dates = buildDateHorizon(now, 'America/Chicago', 1);
    expect(dates[0]).toBe('2026-04-18');
  });
});

describe('filterCandidatesPure — the three filters', () => {
  const tz = 'UTC'; // use UTC for arithmetic clarity in tests
  const date = '2026-04-18';

  it('returns every generated candidate when no filters trip', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const out = filterCandidatesPure({
      date,
      windows: [{ startTime: '10:00', endTime: '12:00' }],
      incrementMinutes: 30,
      spacingMinutes: 60,
      minAdvanceNoticeHours: 0,
      heldUtcIso: [],
      now,
      timezone: tz,
    });
    expect(out.map((c) => c.label)).toEqual([
      '10:00 AM',
      '10:30 AM',
      '11:00 AM',
      '11:30 AM',
    ]);
  });

  it('hides candidates earlier than now() + min_advance_notice_hours', () => {
    // "Now" is 10am on the same day. With 2h notice, 10:00 + 10:30 + 11:00
    // + 11:30 are all within-or-past the cutoff; only the ones at >= 12:00
    // should survive. But the window ends at 12:00, so nothing remains.
    const now = new Date('2026-04-18T10:00:00Z');
    const out = filterCandidatesPure({
      date,
      windows: [{ startTime: '10:00', endTime: '14:00' }],
      incrementMinutes: 60,
      spacingMinutes: 0,
      minAdvanceNoticeHours: 2,
      heldUtcIso: [],
      now,
      timezone: tz,
    });
    // 10:00, 11:00, 12:00, 13:00 → cutoff at 12:00 (now + 2h) → 12:00 and 13:00.
    expect(out.map((c) => c.label)).toEqual(['12:00 PM', '1:00 PM']);
  });

  it('hides candidates within spacing of an active booking', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const out = filterCandidatesPure({
      date,
      windows: [{ startTime: '10:00', endTime: '14:00' }],
      incrementMinutes: 30,
      spacingMinutes: 60,
      minAdvanceNoticeHours: 0,
      // One pending booking at 11:00 UTC → held range (10:00, 12:00) exclusive
      // of the boundaries.
      heldUtcIso: ['2026-04-18T11:00:00.000Z'],
      now,
      timezone: tz,
    });
    // Candidates: 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30.
    // Held at 11:00; spacing 60min ⇒ hide anything within strictly < 60min.
    // diff<60 for 10:30(30), 11:00(0), 11:30(30). 10:00 at 60 and 12:00 at
    // 60 survive (< comparison is strict).
    expect(out.map((c) => c.label)).toEqual([
      '10:00 AM',
      '12:00 PM',
      '12:30 PM',
      '1:00 PM',
      '1:30 PM',
    ]);
  });

  it('stacks filters: advance-notice AND spacing', () => {
    const now = new Date('2026-04-18T10:00:00Z');
    const out = filterCandidatesPure({
      date,
      windows: [{ startTime: '10:00', endTime: '15:00' }],
      incrementMinutes: 60,
      spacingMinutes: 60,
      minAdvanceNoticeHours: 2,
      heldUtcIso: ['2026-04-18T13:00:00.000Z'],
      now,
      timezone: tz,
    });
    // Candidates: 10:00, 11:00, 12:00, 13:00, 14:00.
    // advance-notice cutoff = 12:00 → drop 10:00, 11:00.
    // spacing: hide anything within <60 of 13:00 → drop 13:00 (exact) and...
    //   12:00 is at diff=60 (survives), 14:00 at diff=60 (survives).
    // So surviving: 12:00, 14:00.
    expect(out.map((c) => c.label)).toEqual(['12:00 PM', '2:00 PM']);
  });

  it('returns empty list when window yields nothing', () => {
    const out = filterCandidatesPure({
      date,
      windows: [],
      incrementMinutes: 30,
      spacingMinutes: 0,
      minAdvanceNoticeHours: 0,
      heldUtcIso: [],
      now: new Date('2026-04-17T00:00:00Z'),
      timezone: tz,
    });
    expect(out).toEqual([]);
  });
});

describe('hasAnyAvailability', () => {
  it('is false when every day is empty', () => {
    expect(
      hasAnyAvailability([
        { date: '2026-04-18', candidates: [] },
        { date: '2026-04-19', candidates: [] },
      ]),
    ).toBe(false);
  });

  it('is true if any day has at least one candidate', () => {
    expect(
      hasAnyAvailability([
        { date: '2026-04-18', candidates: [] },
        {
          date: '2026-04-19',
          candidates: [{ startAt: '2026-04-19T14:00:00Z', label: '9:00 AM' }],
        },
      ]),
    ).toBe(true);
  });
});
