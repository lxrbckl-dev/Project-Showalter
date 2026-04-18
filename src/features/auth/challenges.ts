/**
 * Short-lived in-memory WebAuthn challenge store.
 *
 * Every WebAuthn ceremony (registration or authentication) issues a random
 * challenge that must be echoed back by the browser in the signed response.
 * The server verifies the echoed challenge equals the one it issued for
 * that email.
 *
 * Challenges are valid for 5 minutes. We use an in-memory Map because:
 *   - challenges are short-lived — restart = ceremony retry, that's fine
 *   - single-process SQLite app
 *   - avoiding an extra migration for a transient thing
 *
 * When a ceremony completes (success or failure), the challenge is consumed
 * and removed.
 */

const TTL_MS = 5 * 60_000; // 5 minutes

type Entry = { challenge: string; expiresAt: number };

const store = new Map<string, Entry>();

export type ChallengeKind =
  | 'enroll'
  | 'login'
  | 'addDevice'
  | 'foundAdmin'
  | 'acceptInvite';

function k(kind: ChallengeKind, email: string): string {
  return `${kind}:${email.toLowerCase()}`;
}

function sweep(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function saveChallenge(
  kind: ChallengeKind,
  email: string,
  challenge: string,
  now: number = Date.now(),
): void {
  sweep(now);
  store.set(k(kind, email), { challenge, expiresAt: now + TTL_MS });
}

export function consumeChallenge(
  kind: ChallengeKind,
  email: string,
  now: number = Date.now(),
): string | null {
  sweep(now);
  const key = k(kind, email);
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  if (entry.expiresAt <= now) return null;
  return entry.challenge;
}

/** Test-only reset. */
export function __resetChallenges(): void {
  store.clear();
}
