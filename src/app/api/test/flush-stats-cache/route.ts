/**
 * Test-only route: flush the landing-stats in-memory cache so that E2E tests
 * can verify gating logic without waiting for the 5-minute TTL to expire.
 *
 * Enabled only in development and test environments. Returns 404 in production.
 */
import { NextResponse } from 'next/server';
import { invalidateLandingStatsCache } from '@/features/stats/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  invalidateLandingStatsCache();
  return NextResponse.json({ ok: true }, { status: 200 });
}
