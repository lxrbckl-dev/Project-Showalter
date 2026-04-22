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
    throw new Error(
      'BASE_URL is required. Copy .env.example to .env (production) or .env.local.example to .env.local (dev) and set BASE_URL before starting the app.',
    );
  }
  return url;
}
