'use server';

/**
 * Founding-admin server actions (issue #83).
 *
 * On a fresh deploy the `admins` table is empty. The first person to visit
 * `/admin/login` (which detects the empty table and renders `FoundingAdminForm`)
 * claims the founding slot via this module.
 *
 * Two-step WebAuthn ceremony, mirroring the existing bootstrap enrollment
 * shape for consistency:
 *
 *   1. `startFoundingEnrollment(email)` — returns registration options for
 *      the browser ONLY if the admins table is empty. Does NOT reserve the
 *      slot; race protection happens in step 2.
 *
 *   2. `finishFoundingEnrollment(email, response)` — verifies the attestation,
 *      then calls `foundFirstAdmin` (from `found-core.ts`), which atomically:
 *        (a) re-checks the admins table is still empty (inside a tx)
 *        (b) inserts the new admin row
 *        (c) inserts the credential row
 *        (d) inserts the recovery-code row
 *      If (a) fails (two visitors raced and one already inserted), the
 *      transaction rolls back. Combined with the `admins.email` UNIQUE
 *      constraint, exactly one winner is guaranteed — the loser gets the
 *      canonical auth failure with no information leak.
 *
 * All failure paths funnel through the canonical `authFailure()` shape.
 * The real reason is server-logged via `logAuthFailure`.
 */

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getDb, getSqlite } from '@/db';
import { consumeChallenge, saveChallenge } from './challenges';
import { getClientIp } from './client-ip';
import { getRelyingParty } from './relying-party';
import { hashCode, generatePlaintextCode } from './recovery';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import { checkRateLimit } from '@/lib/rate-limit';
import { signIn } from './auth';
import { emailSchema, normalizeEmail } from './invites-shared';
import { adminsTableEmpty, foundFirstAdmin } from './found-core';

const RATE_LIMIT_KEY = 'found';
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

/**
 * Cheap read-only check: are there zero admins?
 *
 * Called by the `/admin/login` server component to decide which form to
 * render. The authoritative check happens inside the transaction run by
 * `finishFoundingEnrollment`.
 *
 * Fails closed (returns false) if the query blows up — that way the regular
 * login form renders and the canonical failure path kicks in, instead of
 * accidentally exposing the founding flow.
 */
export async function isAdminsTableEmpty(): Promise<boolean> {
  try {
    return adminsTableEmpty(getDb());
  } catch {
    return false;
  }
}

export async function startFoundingEnrollment(
  email: string,
): Promise<
  AuthResult<{ options: Awaited<ReturnType<typeof generateRegistrationOptions>> }>
> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'found:start', ip });
    return authFailure();
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    logAuthFailure('invalid_email', { scope: 'found:start' });
    return authFailure();
  }
  const normalized = normalizeEmail(parsed.data);

  if (!(await isAdminsTableEmpty())) {
    logAuthFailure('admins_not_empty', { scope: 'found:start' });
    return authFailure();
  }

  const { rpID, rpName } = getRelyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: normalized,
    userDisplayName: normalized,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  saveChallenge('foundAdmin', normalized, options.challenge);
  return authOk({ options });
}

export async function finishFoundingEnrollment(
  email: string,
  response: RegistrationResponseJSON,
): Promise<AuthResult<{ recoveryCode: string; adminId: number }>> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'found:finish', ip });
    return authFailure();
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    logAuthFailure('invalid_email', { scope: 'found:finish' });
    return authFailure();
  }
  const normalized = normalizeEmail(parsed.data);

  const expectedChallenge = consumeChallenge('foundAdmin', normalized);
  if (!expectedChallenge) {
    logAuthFailure('challenge_missing', { scope: 'found:finish' });
    return authFailure();
  }

  const { rpID, origin } = getRelyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    logAuthFailure('verify_threw', {
      scope: 'found:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  if (!verification.verified || !verification.registrationInfo) {
    logAuthFailure('verify_false', { scope: 'found:finish' });
    return authFailure();
  }

  const info = verification.registrationInfo;
  const cred = info.credential;
  const publicKeyB64 = Buffer.from(cred.publicKey).toString('base64');

  const plaintextRecovery = generatePlaintextCode();
  const hashedRecovery = await hashCode(plaintextRecovery);

  const result = foundFirstAdmin(getSqlite(), getDb(), {
    email: normalized,
    credential: {
      credentialId: cred.id,
      publicKeyB64,
      counter: cred.counter,
      deviceType: info.credentialDeviceType ?? null,
    },
    hashedRecoveryCode: hashedRecovery,
  });

  if (!result.ok) {
    logAuthFailure('founding_tx_failed', {
      scope: 'found:finish',
      reason: result.reason,
    });
    return authFailure();
  }

  // Establish the session so the recovery-code modal can redirect to /admin.
  // If this fails we still return failure — but the admin row exists and they
  // can log in on the next page load.
  try {
    await signIn('webauthn', {
      email: normalized,
      redirect: false,
      credentialId: cred.id,
    });
  } catch (err) {
    logAuthFailure('signin_after_found_failed', {
      scope: 'found:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk({ recoveryCode: plaintextRecovery, adminId: result.adminId });
}
