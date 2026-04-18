/**
 * WebAuthn relying party (RP) configuration.
 *
 * `rpID` is the domain the credential is scoped to (no scheme, no port).
 * `origin` is the scheme + host + optional port the browser reports.
 *
 * In production: `rpID = showalter.business`, `origin = https://showalter.business`.
 * In development: `rpID = localhost`, `origin = http://localhost:<port>`.
 *
 * We derive both from `BASE_URL` at request time so the same codebase works
 * across dev/staging/prod.
 */

export type RelyingParty = {
  rpID: string;
  rpName: string;
  origin: string;
};

const RP_NAME = 'Showalter Services';

export function getRelyingParty(): RelyingParty {
  const raw = process.env.BASE_URL ?? 'http://localhost:5827';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    url = new URL('http://localhost:5827');
  }
  return {
    rpID: url.hostname,
    rpName: RP_NAME,
    origin: url.origin,
  };
}
