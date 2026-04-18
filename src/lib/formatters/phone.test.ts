import { describe, expect, it } from 'vitest';
import { formatUSPhone, normalizeUSPhone } from './phone';

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

describe('normalizeUSPhone()', () => {
  it('normalizes (NXX) NXX-XXXX to E.164', () => {
    expect(normalizeUSPhone('(913) 309-7340')).toBe('+19133097340');
  });

  it('normalizes NXX-NXX-XXXX to E.164', () => {
    expect(normalizeUSPhone('913-309-7340')).toBe('+19133097340');
  });

  it('normalizes NXX.NXX.XXXX to E.164', () => {
    expect(normalizeUSPhone('913.309.7340')).toBe('+19133097340');
  });

  it('normalizes NXX NXX XXXX to E.164', () => {
    expect(normalizeUSPhone('913 309 7340')).toBe('+19133097340');
  });

  it('normalizes 10 plain digits to E.164', () => {
    expect(normalizeUSPhone('9133097340')).toBe('+19133097340');
  });

  it('accepts 11 digits starting with 1', () => {
    expect(normalizeUSPhone('19133097340')).toBe('+19133097340');
  });

  it('accepts leading +1 in various shapes', () => {
    expect(normalizeUSPhone('+1 913 309 7340')).toBe('+19133097340');
    expect(normalizeUSPhone('+1-913-309-7340')).toBe('+19133097340');
  });

  it('rejects numbers shorter than 10 digits', () => {
    expect(normalizeUSPhone('555-1234')).toBeNull();
  });

  it('rejects numbers longer than 11 digits', () => {
    expect(normalizeUSPhone('19133097340123')).toBeNull();
  });

  it('rejects 11-digit numbers not starting with 1', () => {
    expect(normalizeUSPhone('29133097340')).toBeNull();
  });

  it('rejects obvious garbage (all zeros)', () => {
    expect(normalizeUSPhone('0000000000')).toBeNull();
  });

  it('rejects NANP numbers with leading 0/1 in the area code', () => {
    expect(normalizeUSPhone('1234567890')).toBeNull();
    expect(normalizeUSPhone('0234567890')).toBeNull();
  });

  it('rejects NANP numbers with leading 0/1 in the exchange', () => {
    expect(normalizeUSPhone('9131234567')).toBeNull(); // exchange 123 starts with 1
    expect(normalizeUSPhone('9130234567')).toBeNull(); // exchange 023 starts with 0
  });

  it('returns null for empty string', () => {
    expect(normalizeUSPhone('')).toBeNull();
  });

  it('returns null for null / undefined input', () => {
    expect(normalizeUSPhone(null)).toBeNull();
    expect(normalizeUSPhone(undefined)).toBeNull();
  });

  it('rejects inputs with trailing extension digits that push past 10/11', () => {
    // Digit strip of '913-309-7340 ext. 0' yields '91330973400' (11 digits,
    // but not starting with '1') → reject. Prevents ext-suffix confusion.
    expect(normalizeUSPhone('913-309-7340 ext. 0')).toBeNull();
  });
});
