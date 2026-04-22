/**
 * WebAuthn relying party (RP) configuration.
 *
 * `rpID` is the domain the credential is scoped to (no scheme, no port).
 * `origin` is the scheme + host + optional port the browser reports.
 *
 * In production: `rpID = sawyer.showalter.business`, `origin = https://sawyer.showalter.business`.
 * In development: `rpID = localhost`, `origin = http://localhost:<port>`.
 *
 * We derive both from `BASE_URL` at request time so the same codebase works
 * across dev/staging/prod. BASE_URL must be set — see .env.example / .env.local.example.
 */

import { getBaseUrl } from '@/lib/env';

export type RelyingParty = {
  rpID: string;
  rpName: string;
  origin: string;
};

const RP_NAME = 'Showalter Services';

export function getRelyingParty(): RelyingParty {
  const raw = getBaseUrl();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('BASE_URL is malformed: ' + raw);
  }
  return {
    rpID: url.hostname,
    rpName: RP_NAME,
    origin: url.origin,
  };
}
