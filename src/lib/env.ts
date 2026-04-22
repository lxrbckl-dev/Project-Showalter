/**
 * Environment variable helpers.
 *
 * Centralises access to required env vars so callers get a clear error
 * message on misconfiguration instead of a silent undefined / wrong-domain
 * fallback.
 */

export function getBaseUrl(): string {
  const url = process.env.BASE_URL;
  if (!url) {
    // During `next build`, static generation runs before runtime env is
    // available. Return a benign placeholder so the build can complete.
    // Runtime (and dev) hard-fail so misconfig is never silent in prod.
    // Callers whose output would bake the URL into static artifacts
    // (sitemap, robots, etc.) MUST export `const dynamic = 'force-dynamic'`
    // so those routes resolve at request time from real runtime env.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return 'http://localhost';
    }
    throw new Error(
      'BASE_URL is required. Copy .env.example to .env (production) or .env.local.example to .env.local (dev) and set BASE_URL before starting the app.',
    );
  }
  return url;
}
