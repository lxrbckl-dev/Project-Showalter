import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  availabilityOverrideWindows,
  availabilityOverrides,
  weeklyTemplateWindows,
} from '@/db/schema/availability';
import { dayOfWeek, generateStartTimes, resolveWindows } from './resolver';

/**
 * Exhaustive resolver / generator tests — truth-table style across every
 * precedence branch plus slack-discard edge cases for the start-time
 * generator.
 *
 * The resolver is a pure function of (date, db state); the tests spin up an
 * isolated in-memory SQLite per describe-block, apply the schema DDL
 * inline (mirrors the 0004 migration), and then drive the resolver.
 */

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE weekly_template_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      note TEXT
    );
    CREATE INDEX weekly_template_windows_dow_idx
      ON weekly_template_windows(day_of_week);

    CREATE TABLE availability_overrides (
      date TEXT PRIMARY KEY NOT NULL,
      mode TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE availability_override_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      date TEXT NOT NULL REFERENCES availability_overrides(date),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );
    CREATE INDEX availability_override_windows_date_idx
      ON availability_override_windows(date);
  `);
  const db = drizzle(sqlite, { schema }) as Db;
  return { sqlite, db };
}

describe('dayOfWeek', () => {
  it('maps calendar dates to JS weekday numbers (0=Sun … 6=Sat)', () => {
    expect(dayOfWeek('2026-04-12')).toBe(0); // Sunday
    expect(dayOfWeek('2026-04-13')).toBe(1); // Monday
    expect(dayOfWeek('2026-04-17')).toBe(5); // Friday
    expect(dayOfWeek('2026-04-18')).toBe(6); // Saturday
  });
});

describe('resolveWindows — precedence truth table', () => {
  let sqlite: Database.Database;
  let db: Db;

  beforeEach(() => {
    ({ sqlite, db } = makeDb());
  });

  it('branch 1: no override + no template rows → []', () => {
    expect(resolveWindows('2026-04-18', db)).toEqual([]);
    sqlite.close();
  });

  it('branch 2: no override + template rows for the weekday → template windows', () => {
    // Saturday template: 10:00–14:00
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '10:00', endTime: '14:00' })
      .run();

    // 2026-04-18 is a Saturday → template applies
    expect(resolveWindows('2026-04-18', db)).toEqual([
      { startTime: '10:00', endTime: '14:00' },
    ]);

    // 2026-04-17 is a Friday → still unavailable (no Friday template row)
    expect(resolveWindows('2026-04-17', db)).toEqual([]);
    sqlite.close();
  });

  it('branch 2: multiple template windows on a weekday are returned sorted', () => {
    // Insert out of chronological order deliberately.
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '13:00', endTime: '17:00' })
      .run();
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '09:00', endTime: '12:00' })
      .run();

    expect(resolveWindows('2026-04-18', db)).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ]);
    sqlite.close();
  });

  it('branch 3: override closed → [] even when template has windows', () => {
    // Saturday template says 10:00–14:00
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '10:00', endTime: '14:00' })
      .run();
    // But this specific Saturday is explicitly closed
    db.insert(availabilityOverrides)
      .values({
        date: '2026-04-18',
        mode: 'closed',
        note: 'family trip',
        createdAt: '2026-04-17T09:00:00Z',
      })
      .run();

    expect(resolveWindows('2026-04-18', db)).toEqual([]);

    // An unaffected Saturday still uses the template.
    expect(resolveWindows('2026-04-25', db)).toEqual([
      { startTime: '10:00', endTime: '14:00' },
    ]);
    sqlite.close();
  });

  it('branch 4: override open → override windows REPLACE the template for that date', () => {
    // Template: Saturday 10:00–14:00
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '10:00', endTime: '14:00' })
      .run();
    // Override: specific Saturday extended to 08:00–18:00
    db.insert(availabilityOverrides)
      .values({
        date: '2026-04-18',
        mode: 'open',
        note: 'extended hours',
        createdAt: '2026-04-17T09:00:00Z',
      })
      .run();
    db.insert(availabilityOverrideWindows)
      .values({ date: '2026-04-18', startTime: '08:00', endTime: '18:00' })
      .run();

    expect(resolveWindows('2026-04-18', db)).toEqual([
      { startTime: '08:00', endTime: '18:00' },
    ]);
    sqlite.close();
  });

  it('branch 5: override open with ZERO windows → [] (explicit "open but nothing scheduled")', () => {
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '10:00', endTime: '14:00' })
      .run();
    db.insert(availabilityOverrides)
      .values({
        date: '2026-04-18',
        mode: 'open',
        createdAt: '2026-04-17T09:00:00Z',
      })
      .run();
    // No override windows.
    expect(resolveWindows('2026-04-18', db)).toEqual([]);
    sqlite.close();
  });

  it('branch 6: override with unknown mode falls back to template (defensive)', () => {
    db.insert(weeklyTemplateWindows)
      .values({ dayOfWeek: 6, startTime: '10:00', endTime: '14:00' })
      .run();
    db.insert(availabilityOverrides)
      .values({
        date: '2026-04-18',
        // not a real mode — we test defensive behavior
        mode: 'weird',
        createdAt: '2026-04-17T09:00:00Z',
      })
      .run();
    expect(resolveWindows('2026-04-18', db)).toEqual([
      { startTime: '10:00', endTime: '14:00' },
    ]);
    sqlite.close();
  });

  it('override override windows are returned sorted by start time', () => {
    db.insert(availabilityOverrides)
      .values({
        date: '2026-04-18',
        mode: 'open',
        createdAt: '2026-04-17T09:00:00Z',
      })
      .run();
    db.insert(availabilityOverrideWindows)
      .values({ date: '2026-04-18', startTime: '14:00', endTime: '17:00' })
      .run();
    db.insert(availabilityOverrideWindows)
      .values({ date: '2026-04-18', startTime: '08:00', endTime: '11:00' })
      .run();

    expect(resolveWindows('2026-04-18', db)).toEqual([
      { startTime: '08:00', endTime: '11:00' },
      { startTime: '14:00', endTime: '17:00' },
    ]);
    sqlite.close();
  });
});

describe('generateStartTimes', () => {
  it('chops a window evenly and discards the slack tail', () => {
    // STACK.md example verbatim.
    expect(
      generateStartTimes(
        [{ startTime: '10:00', endTime: '14:00' }],
        30,
      ),
    ).toEqual([
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
    ]);
  });

  it('keeps a candidate whose start + increment lands exactly on window end', () => {
    // 09:30 + 30 = 10:00 = end → keep
    expect(
      generateStartTimes([{ startTime: '09:00', endTime: '10:00' }], 30),
    ).toEqual(['09:00', '09:30']);
  });

  it('discards a candidate whose start + increment would exceed end', () => {
    // 09:45 + 30 would land at 10:15 > 10:00 → candidate stops before 09:45
    expect(
      generateStartTimes([{ startTime: '09:00', endTime: '10:00' }], 45),
    ).toEqual(['09:00']);
  });

  it('returns [] for a window shorter than the increment', () => {
    expect(
      generateStartTimes([{ startTime: '09:00', endTime: '09:15' }], 30),
    ).toEqual([]);
  });

  it('returns [] for zero windows', () => {
    expect(generateStartTimes([], 30)).toEqual([]);
  });

  it('flattens across multiple windows and sorts', () => {
    expect(
      generateStartTimes(
        [
          { startTime: '13:00', endTime: '14:00' },
          { startTime: '09:00', endTime: '10:00' },
        ],
        30,
      ),
    ).toEqual(['09:00', '09:30', '13:00', '13:30']);
  });

  it('supports 15- and 60-minute increments', () => {
    expect(
      generateStartTimes([{ startTime: '09:00', endTime: '10:00' }], 15),
    ).toEqual(['09:00', '09:15', '09:30', '09:45']);

    expect(
      generateStartTimes([{ startTime: '09:00', endTime: '12:00' }], 60),
    ).toEqual(['09:00', '10:00', '11:00']);
  });

  it('throws on non-positive increment', () => {
    expect(() => generateStartTimes([{ startTime: '09:00', endTime: '10:00' }], 0)).toThrow();
    expect(() => generateStartTimes([{ startTime: '09:00', endTime: '10:00' }], -5)).toThrow();
  });
});
