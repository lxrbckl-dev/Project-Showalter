/**
 * Best-effort client IP extraction for rate-limit keying.
 *
 * Next.js 15 exposes request headers via `next/headers`. Caddy / reverse
 * proxies forward the real client via `x-forwarded-for` (leftmost entry).
 * Falls back to a static sentinel so a missing header doesn't crash the
 * request — the sentinel is still rate-limited as a single bucket, which
 * is OK for dev / local-only traffic.
 */

import { headers } from 'next/headers';

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
