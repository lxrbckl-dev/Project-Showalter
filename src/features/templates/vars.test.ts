import { describe, expect, it } from 'vitest';
import { buildTemplateVars, formatDate, formatTime } from './vars';

const BASE_INPUT = {
  customerName: 'Jane Doe',
  serviceName: 'Mowing',
  startAtIso: '2026-05-01T14:30:00.000Z',
  addressText: '123 Main St',
  notes: 'Back gate',
  timezone: 'America/Chicago',
  baseUrl: 'https://showalter.business',
  token: 'tok-abc',
} as const;

describe('buildTemplateVars', () => {
  it('populates every canonical placeholder key', () => {
    const vars = buildTemplateVars(BASE_INPUT);
    for (const k of [
      'name',
      'host',
      'service',
      'date',
      'time',
      'address',
      'link',
      'google_link',
      'ics_link',
      'shortlink',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(vars, k)).toBe(true);
    }
  });

  it('emits the configured host name when provided', () => {
    const vars = buildTemplateVars({ ...BASE_INPUT, hostName: 'Mason' });
    expect(vars.host).toBe('Mason');
  });

  it('falls back to "Sawyer" when hostName is null/blank', () => {
    expect(buildTemplateVars({ ...BASE_INPUT, hostName: null }).host).toBe('Sawyer');
    expect(buildTemplateVars({ ...BASE_INPUT, hostName: '   ' }).host).toBe('Sawyer');
    expect(buildTemplateVars(BASE_INPUT).host).toBe('Sawyer');
  });

  it('formats date and time in the site timezone', () => {
    const vars = buildTemplateVars(BASE_INPUT);
    // 14:30Z on May 1 → 9:30 AM Chicago (CDT).
    expect(vars.date).toBe('Fri, May 1');
    expect(vars.time).toBe('9:30 AM');
  });

  it('builds an ics_link at /bookings/<token>/ics', () => {
    const vars = buildTemplateVars(BASE_INPUT);
    expect(vars.ics_link).toBe('https://showalter.business/bookings/tok-abc/ics');
  });

  it('builds a shortlink at /c/<token>', () => {
    const vars = buildTemplateVars(BASE_INPUT);
    expect(vars.shortlink).toBe('https://showalter.business/c/tok-abc');
  });

  it('builds a Google calendar render URL', () => {
    const vars = buildTemplateVars(BASE_INPUT);
    expect(vars.google_link).toMatch(
      /^https:\/\/calendar\.google\.com\/calendar\/render\?/,
    );
    expect(vars.google_link).toContain('text=Mowing');
  });

  it('defaults service to "Service" when null', () => {
    const vars = buildTemplateVars({ ...BASE_INPUT, serviceName: null });
    expect(vars.service).toBe('Service');
  });

  it('leaves `link` empty when no reviewLink given', () => {
    const vars = buildTemplateVars(BASE_INPUT);
    expect(vars.link).toBe('');
  });

  it('uses reviewLink for `link` when provided', () => {
    const vars = buildTemplateVars({
      ...BASE_INPUT,
      reviewLink: 'https://showalter.business/review/xyz',
    });
    expect(vars.link).toBe('https://showalter.business/review/xyz');
  });

  it('tolerates null notes (no crash, no "null" literal)', () => {
    const vars = buildTemplateVars({ ...BASE_INPUT, notes: null });
    // Notes drop out of the Google URL's details entirely.
    expect(vars.google_link).not.toContain('details=');
  });
});

describe('formatDate / formatTime', () => {
  it('renders expected Chicago-local strings', () => {
    expect(formatDate('2026-05-01T14:30:00.000Z', 'America/Chicago')).toBe(
      'Fri, May 1',
    );
    expect(formatTime('2026-05-01T14:30:00.000Z', 'America/Chicago')).toBe(
      '9:30 AM',
    );
  });

  it('rotates correctly across timezones', () => {
    expect(formatTime('2026-05-01T14:30:00.000Z', 'America/New_York')).toBe(
      '10:30 AM',
    );
    expect(formatTime('2026-05-01T14:30:00.000Z', 'UTC')).toBe('2:30 PM');
  });
});
