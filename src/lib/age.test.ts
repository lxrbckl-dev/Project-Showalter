import { describe, expect, it } from 'vitest';
import { calculateAge, interpolateAge } from './age';

/**
 * Tests are deterministic via the `now` option. All "today" values below are
 * constructed as concrete UTC instants and projected into America/Chicago
 * (UTC-6 CST / UTC-5 CDT) unless the test overrides the timezone.
 */

describe('calculateAge()', () => {
  it('returns null when DOB is null', () => {
    expect(calculateAge(null)).toBeNull();
  });

  it('returns null when DOB is undefined', () => {
    expect(calculateAge(undefined)).toBeNull();
  });

  it('returns null when DOB is empty string', () => {
    expect(calculateAge('')).toBeNull();
  });

  it('returns null for malformed DOB', () => {
    expect(calculateAge('not-a-date')).toBeNull();
    expect(calculateAge('2010/06/15')).toBeNull();
    expect(calculateAge('2010-6-15')).toBeNull(); // missing zero pad
  });

  it('returns null for impossible calendar dates (Feb 30)', () => {
    expect(calculateAge('2010-02-30')).toBeNull();
  });

  it('returns null for a DOB in the future', () => {
    // "Today" = 2026-04-18 Chicago → DOB 2030-01-01 is in the future.
    const now = new Date('2026-04-18T12:00:00Z');
    expect(calculateAge('2030-01-01', { now, timezone: 'America/Chicago' })).toBeNull();
  });

  it('returns 0 for a DOB of today (birthday hit)', () => {
    const now = new Date('2026-04-18T18:00:00Z'); // ~1pm Chicago
    expect(calculateAge('2026-04-18', { now, timezone: 'America/Chicago' })).toBe(0);
  });

  it('returns age for a birthday that has already passed this year', () => {
    // Today = 2026-04-18 Chicago. DOB = 2010-03-01 → turned 16 on Mar 1.
    const now = new Date('2026-04-18T18:00:00Z');
    expect(calculateAge('2010-03-01', { now, timezone: 'America/Chicago' })).toBe(16);
  });

  it('returns age-1 for a birthday that has NOT yet happened this year', () => {
    // Today = 2026-04-18 Chicago. DOB = 2010-08-15 → still 15 until Aug 15.
    const now = new Date('2026-04-18T18:00:00Z');
    expect(calculateAge('2010-08-15', { now, timezone: 'America/Chicago' })).toBe(15);
  });

  it('returns the correct age the day BEFORE the birthday', () => {
    // Today = 2026-04-17, birthday = 2010-04-18 → still 15.
    const now = new Date('2026-04-17T18:00:00Z');
    expect(calculateAge('2010-04-18', { now, timezone: 'America/Chicago' })).toBe(15);
  });

  it('returns the incremented age the day OF the birthday', () => {
    // Today = 2026-04-18, birthday = 2010-04-18 → just turned 16.
    const now = new Date('2026-04-18T18:00:00Z');
    expect(calculateAge('2010-04-18', { now, timezone: 'America/Chicago' })).toBe(16);
  });

  describe('leap-day birthdays (Feb 29)', () => {
    it('treats Feb 28 as the birthday in non-leap years', () => {
      // 2026 is NOT a leap year. DOB = 2012-02-29.
      // On Feb 27, 2026 → birthday not yet hit, age is 13.
      // On Feb 28, 2026 → birthday hit, age is 14.
      const feb27 = new Date('2026-02-27T18:00:00Z');
      const feb28 = new Date('2026-02-28T18:00:00Z');
      const mar01 = new Date('2026-03-01T18:00:00Z');

      expect(calculateAge('2012-02-29', { now: feb27, timezone: 'America/Chicago' })).toBe(13);
      expect(calculateAge('2012-02-29', { now: feb28, timezone: 'America/Chicago' })).toBe(14);
      expect(calculateAge('2012-02-29', { now: mar01, timezone: 'America/Chicago' })).toBe(14);
    });

    it('treats Feb 29 as the actual birthday in leap years', () => {
      // 2028 IS a leap year. DOB = 2012-02-29.
      // On Feb 28, 2028 → birthday not yet hit, still 15.
      // On Feb 29, 2028 → birthday hit, age is 16.
      const feb28 = new Date('2028-02-28T18:00:00Z');
      const feb29 = new Date('2028-02-29T18:00:00Z');

      expect(calculateAge('2012-02-29', { now: feb28, timezone: 'America/Chicago' })).toBe(15);
      expect(calculateAge('2012-02-29', { now: feb29, timezone: 'America/Chicago' })).toBe(16);
    });
  });

  it('respects timezone when computing "today"', () => {
    // Midnight UTC on 2026-04-18 is still 2026-04-17 in Chicago (UTC-5 CDT).
    // So if DOB = 2010-04-18, a caller in Chicago should still be 15 (birthday
    // tomorrow local), while a caller in UTC should be 16 (birthday today).
    const now = new Date('2026-04-18T00:30:00Z');
    expect(calculateAge('2010-04-18', { now, timezone: 'America/Chicago' })).toBe(15);
    expect(calculateAge('2010-04-18', { now, timezone: 'UTC' })).toBe(16);
  });
});

describe('interpolateAge()', () => {
  it('returns null when text is null', () => {
    expect(interpolateAge(null, '2010-06-15')).toBeNull();
  });

  it('returns the text unchanged when no [age] placeholder is present', () => {
    const text = 'My name is Sawyer. I take pride in my work.';
    expect(interpolateAge(text, '2010-06-15')).toBe(text);
  });

  it('substitutes [age] with the current age', () => {
    const now = new Date('2026-04-18T18:00:00Z');
    const text = 'I am [age] years old.';
    expect(interpolateAge(text, '2010-03-01', { now, timezone: 'America/Chicago' })).toBe(
      'I am 16 years old.',
    );
  });

  it('tolerates whitespace inside the placeholder', () => {
    const now = new Date('2026-04-18T18:00:00Z');
    expect(
      interpolateAge('I am [ age ] years old.', '2010-03-01', {
        now,
        timezone: 'America/Chicago',
      }),
    ).toBe('I am 16 years old.');
  });

  it('strips the placeholder and tidies whitespace when DOB is null', () => {
    const text = 'I am a [age] year old entrepreneur.';
    expect(interpolateAge(text, null)).toBe('I am a year old entrepreneur.');
  });

  it('strips the placeholder cleanly before punctuation when DOB is null', () => {
    // Punctuation-adjacent strip — the helper swallows the orphan space before
    // a comma / period so the sentence reads naturally.
    const text = 'I am [age], a local lawn care provider.';
    expect(interpolateAge(text, null)).toBe('I am, a local lawn care provider.');
  });
});
