import { describe, expect, it } from 'vitest';
import { AUTH_GENERIC_FAILURE_MESSAGE, authFailure, authOk } from './response';

describe('auth canonical responses', () => {
  it('authFailure is byte-identical across all call sites', () => {
    const a = authFailure();
    const b = authFailure();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.message).toBe(AUTH_GENERIC_FAILURE_MESSAGE);
    expect(a.ok).toBe(false);
  });

  it('authFailure response has exactly { ok, message } keys — no accidental leakage', () => {
    const a = authFailure();
    const keys = Object.keys(a).sort();
    expect(keys).toEqual(['message', 'ok']);
  });

  it('authOk merges payload fields without breaking the ok flag', () => {
    const a = authOk({ options: { foo: 'bar' } });
    expect(a.ok).toBe(true);
    expect(a.options).toEqual({ foo: 'bar' });
  });
});
