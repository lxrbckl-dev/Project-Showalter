import { afterEach, describe, expect, it } from 'vitest';
import { __resetRateLimitStore, checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
  afterEach(() => {
    __resetRateLimitStore();
  });

  it('allows attempts up to the limit then rejects', () => {
    const key = 'k';
    expect(checkRateLimit(key, 3, 60_000, 1000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000, 1001).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000, 1002).allowed).toBe(true);
    const fourth = checkRateLimit(key, 3, 60_000, 1003);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    const key = 'k';
    checkRateLimit(key, 1, 1000, 0);
    expect(checkRateLimit(key, 1, 1000, 500).allowed).toBe(false);
    // At now = window end, bucket is reset.
    expect(checkRateLimit(key, 1, 1000, 1000).allowed).toBe(true);
  });

  it('buckets by key — different keys are independent', () => {
    expect(checkRateLimit('a', 1, 60_000, 0).allowed).toBe(true);
    expect(checkRateLimit('a', 1, 60_000, 1).allowed).toBe(false);
    expect(checkRateLimit('b', 1, 60_000, 2).allowed).toBe(true);
  });

  it('reports remaining accurately inside the window', () => {
    expect(checkRateLimit('x', 5, 60_000, 0).remaining).toBe(4);
    expect(checkRateLimit('x', 5, 60_000, 1).remaining).toBe(3);
    expect(checkRateLimit('x', 5, 60_000, 2).remaining).toBe(2);
  });

  it('rejects when limit or window is non-positive', () => {
    expect(checkRateLimit('x', 0, 60_000).allowed).toBe(false);
    expect(checkRateLimit('x', 5, 0).allowed).toBe(false);
  });
});
