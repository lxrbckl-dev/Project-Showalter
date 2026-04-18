import { describe, expect, it } from 'vitest';
import {
  formatMinutesAsTime,
  isValidDateFormat,
  isValidTimeFormat,
  parseTimeToMinutes,
  validateWindowSet,
  windowsOverlap,
} from './validate';

describe('isValidTimeFormat', () => {
  it('accepts well-formed HH:MM strings', () => {
    expect(isValidTimeFormat('00:00')).toBe(true);
    expect(isValidTimeFormat('09:30')).toBe(true);
    expect(isValidTimeFormat('23:59')).toBe(true);
  });

  it('rejects malformed, out-of-range, or 24h+ strings', () => {
    expect(isValidTimeFormat('9:30')).toBe(false);
    expect(isValidTimeFormat('24:00')).toBe(false);
    expect(isValidTimeFormat('12:60')).toBe(false);
    expect(isValidTimeFormat('ab:cd')).toBe(false);
    expect(isValidTimeFormat('')).toBe(false);
  });
});

describe('isValidDateFormat', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(isValidDateFormat('2026-04-17')).toBe(true);
    expect(isValidDateFormat('2024-02-29')).toBe(true); // leap
  });

  it('rejects malformed or impossible calendar dates', () => {
    expect(isValidDateFormat('2026-13-01')).toBe(false);
    expect(isValidDateFormat('2026-02-30')).toBe(false);
    expect(isValidDateFormat('2025-02-29')).toBe(false); // non-leap
    expect(isValidDateFormat('2026/04/17')).toBe(false);
    expect(isValidDateFormat('not-a-date')).toBe(false);
  });
});

describe('parseTimeToMinutes / formatMinutesAsTime', () => {
  it('round-trips', () => {
    for (const s of ['00:00', '06:15', '12:30', '23:59']) {
      expect(formatMinutesAsTime(parseTimeToMinutes(s))).toBe(s);
    }
  });

  it('throws on bad input', () => {
    expect(() => parseTimeToMinutes('25:00')).toThrow();
  });
});

describe('windowsOverlap', () => {
  it('detects overlap', () => {
    expect(
      windowsOverlap(
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '11:00', endTime: '13:00' },
      ),
    ).toBe(true);
  });

  it('treats adjacent windows as non-overlapping', () => {
    expect(
      windowsOverlap(
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '13:00' },
      ),
    ).toBe(false);
  });

  it('detects containment', () => {
    expect(
      windowsOverlap(
        { startTime: '09:00', endTime: '17:00' },
        { startTime: '10:00', endTime: '11:00' },
      ),
    ).toBe(true);
  });
});

describe('validateWindowSet', () => {
  it('returns null for a valid set', () => {
    expect(
      validateWindowSet([
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '13:00', endTime: '17:00' },
      ]),
    ).toBeNull();
  });

  it('returns null for the empty set (a day with no windows is just closed)', () => {
    expect(validateWindowSet([])).toBeNull();
  });

  it('rejects malformed time strings', () => {
    const err = validateWindowSet([{ startTime: '9:00', endTime: '12:00' }]);
    expect(err).toMatch(/HH:MM/);
  });

  it('rejects end <= start', () => {
    const err = validateWindowSet([{ startTime: '12:00', endTime: '09:00' }]);
    expect(err).toMatch(/end time must be after start time/);
    const eq = validateWindowSet([{ startTime: '09:00', endTime: '09:00' }]);
    expect(eq).toMatch(/end time must be after start time/);
  });

  it('rejects overlapping windows', () => {
    const err = validateWindowSet([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '11:00', endTime: '13:00' },
    ]);
    expect(err).toMatch(/overlap/);
  });

  it('allows adjacent windows', () => {
    expect(
      validateWindowSet([
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '17:00' },
      ]),
    ).toBeNull();
  });
});
