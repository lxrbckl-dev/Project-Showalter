import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs', () => {
  const INPUT = {
    token: 'tok-abc123',
    startAtIso: '2026-05-01T14:30:00.000Z',
    durationMinutes: 60,
    summary: 'Mowing',
    location: '123 Main St',
    description: 'Back gate',
    timezone: 'America/Chicago',
    now: new Date('2026-04-17T10:00:00.000Z'),
  } as const;

  it('emits a BEGIN:VCALENDAR + END:VCALENDAR envelope', () => {
    const ics = buildIcs(INPUT);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('uses CRLF line endings', () => {
    const ics = buildIcs(INPUT);
    // Every newline must be \r\n — there should be no bare \n.
    const bareNewlines = ics.split('').filter((c, i, arr) => {
      return c === '\n' && arr[i - 1] !== '\r';
    });
    expect(bareNewlines).toHaveLength(0);
  });

  it('has VERSION:2.0 and a PRODID', () => {
    const ics = buildIcs(INPUT);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toMatch(/PRODID:[^\r\n]+/);
  });

  it('uses the booking token in the UID', () => {
    const ics = buildIcs(INPUT);
    expect(ics).toContain('UID:booking-tok-abc123@showalter.business');
  });

  it('emits DTSTART with TZID from site_config', () => {
    const ics = buildIcs(INPUT);
    expect(ics).toMatch(
      /DTSTART;TZID=America\/Chicago:\d{8}T\d{6}\r\n/,
    );
    // Timezone also declared in VTIMEZONE.
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:America/Chicago');
    expect(ics).toContain('END:VTIMEZONE');
  });

  it('projects DTSTART from UTC into the configured timezone', () => {
    // 14:30Z → 09:30 America/Chicago (CDT, UTC-5 in May).
    const ics = buildIcs(INPUT);
    expect(ics).toContain('DTSTART;TZID=America/Chicago:20260501T093000');
    expect(ics).toContain('DTEND;TZID=America/Chicago:20260501T103000');
  });

  it('includes SUMMARY, LOCATION, DESCRIPTION (when set)', () => {
    const ics = buildIcs(INPUT);
    expect(ics).toContain('SUMMARY:Mowing');
    expect(ics).toContain('LOCATION:123 Main St');
    expect(ics).toContain('DESCRIPTION:Back gate');
  });

  it('escapes commas, semicolons, and newlines in text values', () => {
    const ics = buildIcs({
      ...INPUT,
      location: '1 Main St, KC, KS',
      description: 'Line one;\nLine two',
    });
    expect(ics).toContain('LOCATION:1 Main St\\, KC\\, KS');
    expect(ics).toContain('DESCRIPTION:Line one\\;\\nLine two');
  });

  it('omits the VEVENT DESCRIPTION when no notes are provided', () => {
    const ics = buildIcs({ ...INPUT, description: undefined });
    // Only the VALARM's DESCRIPTION:Reminder should remain; there should be
    // no DESCRIPTION line carrying the (absent) customer notes.
    const descriptionLines = ics
      .split('\r\n')
      .filter((l) => l.startsWith('DESCRIPTION:'));
    expect(descriptionLines).toEqual(['DESCRIPTION:Reminder']);
  });

  it('emits a 24-hour VALARM before DTSTART', () => {
    const ics = buildIcs(INPUT);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('ACTION:DISPLAY');
    expect(ics).toContain('TRIGGER:-PT24H');
    expect(ics).toContain('END:VALARM');
  });

  it('defaults duration to 60 minutes', () => {
    const ics = buildIcs({ ...INPUT, durationMinutes: undefined });
    // 09:30 → 10:30 Chicago for a 60-min default.
    expect(ics).toContain('DTEND;TZID=America/Chicago:20260501T103000');
  });

  it('renders DTSTAMP from the injected `now`', () => {
    const ics = buildIcs(INPUT);
    expect(ics).toContain('DTSTAMP:20260417T100000Z');
  });

  it('throws on an invalid start ISO', () => {
    expect(() =>
      buildIcs({ ...INPUT, startAtIso: 'garbage' }),
    ).toThrow(/Invalid startAtIso/);
  });
});
