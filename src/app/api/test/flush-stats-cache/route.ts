/**
 * Test-only route: flush the landing-stats in-memory cache so that E2E tests
 * can verify gating logic without waiting for the 5-minute TTL to expire.
 *
 * Gated behind the ALLOW_TEST_ENDPOINTS env var (set to 'true' in the
 * Playwright webServer env) so it is inert in real production deployments
 * even though NODE_ENV is 'production' during E2E runs.
 */
import { NextResponse } from 'next/server';
import { invalidateLandingStatsCache } from '@/features/stats/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  if (process.env.ALLOW_TEST_ENDPOINTS !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  invalidateLandingStatsCache();
  return NextResponse.json({ ok: true }, { status: 200 });
}
