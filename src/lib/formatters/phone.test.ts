import { describe, expect, it } from 'vitest';
import { formatUSPhone } from './phone';

describe('formatUSPhone()', () => {
  it('formats E.164 US number', () => {
    expect(formatUSPhone('+19133097340')).toBe('(913) 309-7340');
  });

  it('formats 10-digit number (no country code)', () => {
    expect(formatUSPhone('9133097340')).toBe('(913) 309-7340');
  });

  it('formats 11-digit with leading 1 (no +)', () => {
    expect(formatUSPhone('19133097340')).toBe('(913) 309-7340');
  });

  it('returns the input unchanged for non-US / unrecognized formats', () => {
    expect(formatUSPhone('555-1234')).toBe('555-1234');
  });

  it('returns the input unchanged for empty string', () => {
    expect(formatUSPhone('')).toBe('');
  });

  it('handles a different valid number', () => {
    expect(formatUSPhone('+12125551234')).toBe('(212) 555-1234');
  });
});
