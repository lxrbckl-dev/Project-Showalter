import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isBootstrapEnabled } from './bootstrap';

const originalEnv = process.env.BOOTSTRAP_ENABLED;

describe('isBootstrapEnabled', () => {
  beforeEach(() => {
    delete process.env.BOOTSTRAP_ENABLED;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.BOOTSTRAP_ENABLED;
    else process.env.BOOTSTRAP_ENABLED = originalEnv;
  });

  it('returns false when unset', () => {
    expect(isBootstrapEnabled()).toBe(false);
  });

  it('returns false for the string "false"', () => {
    process.env.BOOTSTRAP_ENABLED = 'false';
    expect(isBootstrapEnabled()).toBe(false);
  });

  it('returns false for truthy-looking non-literal values', () => {
    for (const v of ['1', 'yes', 'True', 'TRUE', 'y', 'enabled', '']) {
      process.env.BOOTSTRAP_ENABLED = v;
      expect(isBootstrapEnabled()).toBe(false);
    }
  });

  it('returns true only for the literal string "true"', () => {
    process.env.BOOTSTRAP_ENABLED = 'true';
    expect(isBootstrapEnabled()).toBe(true);
  });
});
