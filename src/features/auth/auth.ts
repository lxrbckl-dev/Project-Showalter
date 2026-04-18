/**
 * DB-backed session layer — Auth.js-compatible surface.
 *
 * Exports `auth`, `signIn`, `signOut`, and `handlers` with the shape the admin
 * shell expects (an `auth()`-returns-session-or-null helper + `signIn` /
 * `signOut` server actions). Internally this is a small hand-rolled session
 * manager backed by the same `user` / `session` tables the Auth.js Drizzle
 * adapter would use — we keep the adapter-shaped schema so we can swap in
 * Auth.js's OAuth providers later without a migration.
 *
 * JUDGMENT CALL (SWE-2): Auth.js v5's Credentials provider forces
 * `session.strategy === 'jwt'` — you cannot use DB-backed sessions with a
 * Credentials provider. The ticket explicitly requires DB-backed sessions
 * via `@auth/drizzle-adapter` AND WebAuthn-powered auth. Since WebAuthn with
 * DB sessions is effectively "post-verification establish DB session", the
 * simplest robust implementation is to cut out the Credentials-provider
 * middleman and write the session rows directly. The exported API is the
 * same, tables are the same (so the adapter can still be plugged in for
 * OAuth if we ever add it), and the Auth.js NPM deps remain installed per
 * the ticket. If Auth.js v5 ever supports DB sessions + Credentials we
 * re-wire through `NextAuth()` without touching callers.
 *
 * Session layout:
 *   - cookie name: `swt-session` (Showalter — non-standard so it doesn't
 *     clash with a future Auth.js cookie)
 *   - cookie value: opaque session token (random 48 bytes, base64url)
 *   - cookie flags: HttpOnly, SameSite=Lax, Secure in prod, Path=/
 *   - TTL: 30 days, sliding — extended on every authenticated read when
 *     the remaining window drops below 29 days (i.e. once per day)
 *   - server state: one row in `session` with PK = cookie value, FK to `user`
 */

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, users, type UserRow } from '@/db/schema/auth-sessions';

const COOKIE_NAME = 'swt-session';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;

export type AuthSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  /**
   * WebAuthn credential_id (base64url) that was used to establish this
   * session, if known. Pre-0011 sessions, and server-side session creations
   * that didn't pass a credentialId, have this field as null.
   */
  credentialId: string | null;
  expires: Date;
};

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function newToken(): string {
  return randomBytes(48).toString('base64url');
}

function getOrCreateUserByEmail(email: string): UserRow {
  const db = getDb();
  const existing = db.select().from(users).where(eq(users.email, email)).all();
  if (existing[0]) return existing[0];
  const id = crypto.randomUUID();
  db.insert(users).values({ id, email, name: email }).run();
  return db.select().from(users).where(eq(users.id, id)).all()[0]!;
}

/**
 * Read the current session, if any. Extends the session TTL if the cookie
 * is more than 1 day old — implements the 30-day sliding expiry.
 */
export async function auth(): Promise<AuthSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDb();
  const rows = db.select().from(sessions).where(eq(sessions.sessionToken, token)).all();
  const row = rows[0];
  if (!row) return null;

  const expiresAt =
    row.expires instanceof Date ? row.expires.getTime() : Number(row.expires);
  if (expiresAt <= Date.now()) {
    // Session expired — clean up + no-op.
    db.delete(sessions).where(eq(sessions.sessionToken, token)).run();
    return null;
  }

  const userRows = db.select().from(users).where(eq(users.id, row.userId)).all();
  const user = userRows[0];
  if (!user) return null;

  // Sliding expiry: if less than 29 days remain, push back out to 30.
  const remaining = expiresAt - Date.now();
  if (remaining < THIRTY_DAYS_MS - ONE_DAY_MS) {
    const newExpiry = new Date(Date.now() + THIRTY_DAYS_MS);
    db.update(sessions)
      .set({ expires: newExpiry })
      .where(eq(sessions.sessionToken, token))
      .run();
    try {
      jar.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd(),
        path: '/',
        expires: newExpiry,
      });
    } catch {
      // set() may throw in read-only contexts (e.g. generateMetadata) — ignore.
    }
  }

  return {
    user: { id: user.id, email: user.email ?? '', name: user.name },
    credentialId: row.credentialId ?? null,
    expires: new Date(expiresAt),
  };
}

/**
 * Auth.js-compatible `signIn` shim. Only supports our `webauthn` "provider"
 * name for parity with the original config. Creates the session row + sets
 * the cookie. Called from `finishLogin` AND `finishEnrollment` (and
 * `finishAddDevice`) after a successful WebAuthn verification.
 *
 * The optional `credentialId` records which passkey was used to establish
 * this session. Populating it enables two features:
 *   - identifying the "current device" row in the devices management UI
 *   - targeted session invalidation when a credential is removed (see
 *     `removeDevice` in `devices.ts`)
 */
export async function signIn(
  _provider: 'webauthn',
  opts: { email: string; redirect?: boolean; credentialId?: string },
): Promise<{ ok: true }> {
  const email = opts.email.toLowerCase();
  const user = getOrCreateUserByEmail(email);
  const token = newToken();
  const expires = new Date(Date.now() + THIRTY_DAYS_MS);

  getDb()
    .insert(sessions)
    .values({
      sessionToken: token,
      userId: user.id,
      expires,
      credentialId: opts.credentialId ?? null,
    })
    .run();

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd(),
    path: '/',
    expires,
  });

  return { ok: true };
}

/**
 * Auth.js-compatible `signOut` shim. Deletes the session row + clears the cookie.
 */
export async function signOut(): Promise<{ ok: true }> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    getDb().delete(sessions).where(eq(sessions.sessionToken, token)).run();
    jar.delete(COOKIE_NAME);
  }
  return { ok: true };
}

/**
 * Auth.js `handlers` placeholder. We don't expose a `/api/auth/*` endpoint
 * because login + enrollment go through our own server actions. If we ever
 * add OAuth via `NextAuth()`, this is the slot its handlers would live in.
 */
export const handlers = {
  GET: async () =>
    new Response('Not Found', { status: 404 }),
  POST: async () =>
    new Response('Not Found', { status: 404 }),
};

export const SESSION_COOKIE_NAME = COOKIE_NAME;
