'use server';

/**
 * Passkey login server actions — single-admin install.
 *
 * No email required from the client. The flow:
 *
 *   1. `startLogin()` — resolves the lone enrolled admin server-side,
 *      returns authentication options scoped to their credential set.
 *   2. `finishLogin(response)` — verifies the assertion against the
 *      credential identified by `response.id`, bumps the counter, and
 *      establishes a DB-backed session keyed on `admin.id`.
 *
 * Both paths return the canonical `authFailure()` on any rejection. We
 * key the challenge map on `admin.id` (instead of email) so the same
 * single-admin assumption holds across the start → finish round trip.
 */

import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins, credentials, type AdminRow } from '@/db/schema';
import { findCredentialById, listCredentialsForAdmin } from './admin-queries';
import { consumeChallenge, saveChallenge } from './challenges';
import { getClientIp } from './client-ip';
import { getRelyingParty } from './relying-party';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import { checkRateLimit } from '@/lib/rate-limit';
import { signIn } from './auth';

const RATE_LIMIT_KEY = 'login';
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

/** Resolve the lone active+enrolled admin. Null when none is ready to log in. */
function resolveAdmin(): AdminRow | null {
  const rows = getDb().select().from(admins).all();
  return rows.find((a) => a.active === 1 && a.enrolledAt !== null) ?? null;
}

/** Stable per-admin challenge key — replaces the per-email key from the multi-admin era. */
function challengeKey(adminId: number): string {
  return `admin:${adminId}`;
}

export async function startLogin(): Promise<
  AuthResult<{ options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }>
> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'login', ip });
    return authFailure();
  }

  const admin = resolveAdmin();
  if (!admin) {
    logAuthFailure('admin_not_enrolled', { scope: 'login' });
    return authFailure();
  }

  const creds = listCredentialsForAdmin(admin.id);
  const { rpID } = getRelyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.credentialId })),
    userVerification: 'preferred',
  });

  saveChallenge('login', challengeKey(admin.id), options.challenge);
  return authOk({ options });
}

export async function finishLogin(
  response: AuthenticationResponseJSON,
): Promise<AuthResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'login:finish', ip });
    return authFailure();
  }

  const admin = resolveAdmin();
  if (!admin) {
    logAuthFailure('admin_not_enrolled', { scope: 'login:finish' });
    return authFailure();
  }

  const expectedChallenge = consumeChallenge('login', challengeKey(admin.id));
  if (!expectedChallenge) {
    logAuthFailure('challenge_missing', { scope: 'login:finish' });
    return authFailure();
  }

  const credRow = findCredentialById(response.id);
  if (!credRow || credRow.adminId !== admin.id) {
    logAuthFailure('credential_not_found', { scope: 'login:finish' });
    return authFailure();
  }

  const { rpID, origin } = getRelyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credRow.credentialId,
        publicKey: new Uint8Array(Buffer.from(credRow.publicKey, 'base64')),
        counter: credRow.counter,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    logAuthFailure('verify_threw', {
      scope: 'login:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  if (!verification.verified) {
    logAuthFailure('verify_false', { scope: 'login:finish' });
    return authFailure();
  }

  // Bump counter to the new value (helps prevent cloned-authenticator replay).
  getDb()
    .update(credentials)
    .set({ counter: verification.authenticationInfo.newCounter })
    .where(eq(credentials.id, credRow.id))
    .run();

  // Establish a DB-backed session, recording which credential was used so
  // the devices-management feature can identify "this device" and invalidate
  // this session cleanly if the credential is later removed.
  try {
    await signIn('webauthn', {
      adminId: admin.id,
      redirect: false,
      credentialId: credRow.credentialId,
    });
  } catch (err) {
    logAuthFailure('signin_failed', {
      scope: 'login:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk();
}
