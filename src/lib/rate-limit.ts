/**
 * In-memory fixed-window rate limiter.
 *
 * Used by the admin auth server actions to cap per-IP attempts. Keyed by
 * whatever the caller passes (typically `login:<ip>` or `enroll:<ip>`).
 *
 * Fixed-window is slightly coarser than a true token bucket but trivial to
 * reason about and appropriate for the single-process SQLite / Docker
 * deployment this project ships to. If we ever move to multi-process, this
 * swaps out for a shared store (Redis, SQLite-backed counter, etc.).
 *
 * The store is process-local; it does NOT survive a restart. That's fine
 * for brute-force defense — an attacker restarting our process costs them
 * more than it costs us.
 */

export type RateLimitResult = {
  /** True if the request should be allowed. */
  allowed: boolean;
  /** How many attempts are left in the current window (0 when not allowed). */
  remaining: number;
  /** Milliseconds until the caller may try again after being blocked. Always >= 0. */
  retryAfterMs: number;
};

type Bucket = {
  count: number;
  /** Epoch-ms at which this bucket resets. */
  resetAt: number;
};

type Store = Map<string, Bucket>;

// Module-level singleton store. Exported for test resets only.
const defaultStore: Store = new Map();

/** Clears the module-level store — test-only helper. */
export function __resetRateLimitStore(): void {
  defaultStore.clear();
}

/**
 * Check and record an attempt against a rate limit.
 *
 * Returns `{ allowed: true }` if the caller is under the per-window cap,
 * `{ allowed: false }` otherwise. Callers should treat the two responses
 * identically in terms of error content (see the no-enumeration policy in
 * `src/features/auth/response.ts`) — the boolean is for control flow + telemetry.
 *
 * @param key       Identifier to bucket by (e.g. `"login:1.2.3.4"`).
 * @param limit     Maximum allowed attempts per window.
 * @param windowMs  Window size in milliseconds.
 * @param now       Clock override (testing). Defaults to `Date.now()`.
 * @param store     Store override (testing). Defaults to the module singleton.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
  store: Store = defaultStore,
): RateLimitResult {
  if (limit <= 0 || windowMs <= 0) {
    return { allowed: false, remaining: 0, retryAfterMs: windowMs > 0 ? windowMs : 0 };
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // Fresh window.
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return {
      allowed: true,
      remaining: limit - bucket.count,
      retryAfterMs: 0,
    };
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterMs: Math.max(0, bucket.resetAt - now),
  };
}
