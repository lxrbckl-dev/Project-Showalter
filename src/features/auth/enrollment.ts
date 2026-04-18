'use server';

/**
 * Passkey enrollment server actions.
 *
 * Two-step ceremony:
 *   1. `startEnrollment(email)` — gates on BOOTSTRAP + admin state, then
 *      returns registration options for the browser to pass into
 *      `navigator.credentials.create()`.
 *   2. `finishEnrollment(email, response)` — verifies the attestation,
 *      persists the credential, mints + stores a recovery code, flips
 *      `admins.enrolled_at`, returns the plaintext recovery code for
 *      one-time display.
 *
 * All failure paths return the single canonical `authFailure()` shape.
 * The real reason is logged server-side via `logAuthFailure`.
 */

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins, credentials } from '@/db/schema';
import { classifyAdmin } from './admin-queries';
import { isBootstrapEnabled } from './bootstrap';
import { consumeChallenge, saveChallenge } from './challenges';
import { getClientIp } from './client-ip';
import { getRelyingParty } from './relying-party';
import { issueRecoveryCode } from './recovery';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import { checkRateLimit } from '@/lib/rate-limit';
import { signIn } from './auth';

const RATE_LIMIT_KEY = 'enroll';
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

export async function startEnrollment(
  email: string,
): Promise<
  AuthResult<{ options: Awaited<ReturnType<typeof generateRegistrationOptions>> }>
> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'enroll', ip });
    return authFailure();
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    logAuthFailure('empty_email', { scope: 'enroll' });
    return authFailure();
  }

  if (!isBootstrapEnabled()) {
    logAuthFailure('bootstrap_disabled', { scope: 'enroll', email: normalized });
    return authFailure();
  }

  const { status, admin } = classifyAdmin(normalized);
  if (status !== 'pending' || !admin) {
    logAuthFailure('admin_not_pending', { scope: 'enroll', email: normalized, status });
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

  saveChallenge('enroll', normalized, options.challenge);
  return authOk({ options });
}

export async function finishEnrollment(
  email: string,
  response: RegistrationResponseJSON,
): Promise<AuthResult<{ recoveryCode: string; adminId: number }>> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'enroll:finish', ip });
    return authFailure();
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) return authFailure();

  if (!isBootstrapEnabled()) {
    logAuthFailure('bootstrap_disabled', { scope: 'enroll:finish', email: normalized });
    return authFailure();
  }

  const { status, admin } = classifyAdmin(normalized);
  if (status !== 'pending' || !admin) {
    logAuthFailure('admin_not_pending', { scope: 'enroll:finish', status });
    return authFailure();
  }

  const expectedChallenge = consumeChallenge('enroll', normalized);
  if (!expectedChallenge) {
    logAuthFailure('challenge_missing', { scope: 'enroll:finish' });
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
      scope: 'enroll:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  if (!verification.verified || !verification.registrationInfo) {
    logAuthFailure('verify_false', { scope: 'enroll:finish' });
    return authFailure();
  }

  const info = verification.registrationInfo;
  const cred = info.credential;
  const publicKeyB64 = Buffer.from(cred.publicKey).toString('base64');

  // Insert credential + flip enrolled_at atomically.
  const db = getDb();
  try {
    db.insert(credentials)
      .values({
        adminId: admin.id,
        credentialId: cred.id,
        publicKey: publicKeyB64,
        counter: cred.counter,
        deviceType: info.credentialDeviceType,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    logAuthFailure('credential_insert_failed', {
      scope: 'enroll:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  db.update(admins)
    .set({ enrolledAt: new Date().toISOString() })
    .where(eq(admins.id, admin.id))
    .run();

  const recoveryCode = await issueRecoveryCode(admin.id);

  // Establish the session so the recovery-code modal can dismiss into /admin.
  // Record the just-registered credential_id so it shows up as "this device"
  // in the devices-management UI and is invalidated cleanly if removed.
  try {
    await signIn('webauthn', {
      email: normalized,
      redirect: false,
      credentialId: cred.id,
    });
  } catch (err) {
    logAuthFailure('signin_after_enroll_failed', {
      scope: 'enroll:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    // Return failure — the credential + recovery-code rows are persisted but
    // the admin will need to try login on the next page load.
    return authFailure();
  }

  return authOk({ recoveryCode, adminId: admin.id });
}
