import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl } from './google-url';

describe('buildGoogleCalendarUrl', () => {
  it('formats start and end as YYYYMMDDTHHMMSS pair', () => {
    const url = buildGoogleCalendarUrl({
      startAtIso: '2026-05-01T14:30:00.000Z',
      durationMinutes: 60,
      text: 'Mowing',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://calendar.google.com/calendar/render',
    );
    expect(parsed.searchParams.get('dates')).toBe(
      '20260501T143000/20260501T153000',
    );
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
  });

  it('URL-encodes text, location, and details', () => {
    const url = buildGoogleCalendarUrl({
      startAtIso: '2026-05-01T14:30:00.000Z',
      text: 'Mowing & edging',
      location: '123 Main St, Kansas City, KS',
      details: 'Notes:\nGate on the north side.',
    });
    // Raw URL must NOT contain a literal ampersand that could be mistaken
    // for a param separator within any param value.
    expect(url).toContain('text=Mowing+%26+edging');
    expect(url).toContain('location=123+Main+St%2C+Kansas+City%2C+KS');
    expect(url).toContain('details=Notes%3A%0AGate+on+the+north+side.');
  });

  it('defaults duration to 60 minutes', () => {
    const url = buildGoogleCalendarUrl({
      startAtIso: '2026-05-01T09:00:00.000Z',
      text: 'Trash Can Cleaning',
    });
    const dates = new URL(url).searchParams.get('dates');
    expect(dates).toBe('20260501T090000/20260501T100000');
  });

  it('omits location and details when absent', () => {
    const url = buildGoogleCalendarUrl({
      startAtIso: '2026-05-01T12:00:00.000Z',
      text: 'Mowing',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('location')).toBe(false);
    expect(parsed.searchParams.has('details')).toBe(false);
  });

  it('throws on an invalid start-at ISO', () => {
    expect(() =>
      buildGoogleCalendarUrl({
        startAtIso: 'not-a-date',
        text: 'Mowing',
      }),
    ).toThrow(/Invalid startAtIso/);
  });
});
