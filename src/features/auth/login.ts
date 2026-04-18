'use server';

/**
 * Passkey login server actions.
 *
 * Two-step ceremony:
 *   1. `startLogin(email)` — gates on admin state (must be active + enrolled),
 *      returns authentication options for the browser.
 *   2. `finishLogin(email, response)` — verifies the assertion, bumps the
 *      credential counter, and establishes a DB-backed session via Auth.js.
 *
 * Both paths return the single canonical `authFailure()` on any rejection.
 * The BOOTSTRAP flag is not checked here — bootstrap only controls enrollment;
 * login is driven entirely by `enrolled_at IS NOT NULL`.
 */

import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { credentials } from '@/db/schema';
import { classifyAdmin, findCredentialById, listCredentialsForAdmin } from './admin-queries';
import { consumeChallenge, saveChallenge } from './challenges';
import { getClientIp } from './client-ip';
import { getRelyingParty } from './relying-party';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import { checkRateLimit } from '@/lib/rate-limit';
import { signIn } from './auth';

const RATE_LIMIT_KEY = 'login';
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

export async function startLogin(
  email: string,
): Promise<
  AuthResult<{ options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }>
> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'login', ip });
    return authFailure();
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) return authFailure();

  const { status, admin } = classifyAdmin(normalized);
  if (status !== 'enrolled' || !admin) {
    logAuthFailure('admin_not_enrolled', { scope: 'login', status });
    return authFailure();
  }

  const creds = listCredentialsForAdmin(admin.id);
  const { rpID } = getRelyingParty();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.credentialId })),
    userVerification: 'preferred',
  });

  saveChallenge('login', normalized, options.challenge);
  return authOk({ options });
}

export async function finishLogin(
  email: string,
  response: AuthenticationResponseJSON,
): Promise<AuthResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'login:finish', ip });
    return authFailure();
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) return authFailure();

  const { status, admin } = classifyAdmin(normalized);
  if (status !== 'enrolled' || !admin) {
    logAuthFailure('admin_not_enrolled', { scope: 'login:finish', status });
    return authFailure();
  }

  const expectedChallenge = consumeChallenge('login', normalized);
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

  // Establish a DB-backed session.
  try {
    await signIn('webauthn', { email: normalized, redirect: false });
  } catch (err) {
    logAuthFailure('signin_failed', {
      scope: 'login:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk();
}
