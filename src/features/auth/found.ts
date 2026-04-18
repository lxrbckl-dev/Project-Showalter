'use server';

/**
 * Founding-admin server actions (issue #83).
 *
 * On a fresh deploy the `admins` table is empty. The first person to visit
 * `/admin/login` (which detects the empty table and renders `FoundingAdminForm`)
 * claims the founding slot via this module.
 *
 * Three-step WebAuthn ceremony:
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
 *      Critically, this action does NOT mint a session. Minting a session
 *      here triggers an RSC refresh which unmounts `FoundingAdminForm`
 *      before the client can flush `stage = 'recovery-modal'`, destroying
 *      the one-time recovery code before the user sees it (issue #84 QA).
 *      Instead, the freshly-created admin row exists without a session —
 *      if the user bails between step 2 and step 3, `admin:reset` via CLI
 *      can wipe and restart.
 *
 *   3. `finalizeFoundingSession({ adminId, credentialId })` — called by the
 *      client after the recovery-code modal is dismissed. Verifies the admin
 *      row still exists, was enrolled very recently (defense-in-depth cap on
 *      the race window, see `FOUNDING_FINALIZE_MAX_AGE_MS`), and matches the
 *      supplied credential. Then mints the session via the shared signIn
 *      shim. Refuses if a session is already established.
 *
 * All failure paths funnel through the canonical `authFailure()` shape.
 * The real reason is server-logged via `logAuthFailure`.
 */

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { getDb, getSqlite } from '@/db';
import { admins, credentials } from '@/db/schema';
import { consumeChallenge, saveChallenge } from './challenges';
import { getClientIp } from './client-ip';
import { getRelyingParty } from './relying-party';
import { hashCode, generatePlaintextCode } from './recovery';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import { checkRateLimit } from '@/lib/rate-limit';
import { auth, signIn } from './auth';
import { emailSchema, normalizeEmail } from './invites-shared';
import { adminsTableEmpty, foundFirstAdmin } from './found-core';

const RATE_LIMIT_KEY = 'found';
/**
 * The founding flow only runs on a fresh deploy — once per server lifetime
 * in production. 10 attempts per 10 minutes is still firm abuse protection
 * (WebAuthn ceremony cost + canonical failure shape hides per-attempt
 * signal), and it's high enough that multiple E2E specs running in sequence
 * inside a single webserver process don't collide.
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;

/**
 * Finalize has its own bucket because it's the third call per successful
 * enrollment. Sharing the 5/10min cap with start+finish would cap the
 * whole flow at ~1 enrollment per window from one IP — fine in production
 * (you don't expect more than one founding ceremony per IP per 10m) but
 * it trips the E2E suite where multiple specs exercise the founding flow
 * in the same webserver process. Keeping it separate + loose also means
 * a user who's stuck clicking "Continue" a few times (transient network
 * blip) doesn't get locked out with no way to recover.
 */
const FINALIZE_RATE_LIMIT_KEY = 'foundFinalize';
const FINALIZE_RATE_LIMIT = 20;
const FINALIZE_RATE_WINDOW_MS = 10 * 60_000;

/**
 * Max age of `admins.enrolled_at` at which `finalizeFoundingSession` will
 * still mint a session. Caps the window in which a stolen `{adminId,
 * credentialId}` tuple could be replayed. Generous enough to tolerate a
 * distracted user reading the recovery code before clicking "Continue".
 */
const FOUNDING_FINALIZE_MAX_AGE_MS = 10 * 60_000;

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
): Promise<
  AuthResult<{ recoveryCode: string; adminId: number; credentialId: string }>
> {
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

  // IMPORTANT: do NOT establish the session here. Session minting mutates the
  // cookie jar which triggers an RSC refresh — that re-renders `/admin/login`
  // with a non-empty `admins` table, swaps FoundingAdminForm → LoginForm, and
  // unmounts the form before the client can flush `stage = 'recovery-modal'`.
  // The founding admin would permanently lose the one-time recovery code.
  //
  // Instead, return `{ recoveryCode, adminId, credentialId }` so the client can
  // render the recovery-code modal, and only mint the session after the user
  // dismisses it via `finalizeFoundingSession` (below). Between this step and
  // that one the admin row exists without a session — if the user bails,
  // `admin:reset` via CLI can wipe and restart.
  return authOk({
    recoveryCode: plaintextRecovery,
    adminId: result.adminId,
    credentialId: cred.id,
  });
}

/**
 * Finalize the founding-admin enrollment by minting a session.
 *
 * Called by the client AFTER the recovery-code modal is dismissed — that's
 * the point at which it's safe to trigger the RSC refresh that a session
 * cookie causes.
 *
 * Safety checks:
 *   - The caller must not already have a session (prevents double-invocation
 *     + hostile replay once a victim is already logged in).
 *   - The admin row identified by `adminId` must exist.
 *   - A credential with `credentialId` must belong to that admin. This ties
 *     the finalize call to the same WebAuthn ceremony that created the
 *     admin; an attacker needs both values to mint a session, and they
 *     were only ever returned to the original client.
 *   - `admins.enrolled_at` must be within the last
 *     `FOUNDING_FINALIZE_MAX_AGE_MS` — caps the replay window on a stolen
 *     `{adminId, credentialId}` tuple.
 */
export async function finalizeFoundingSession(
  input: { adminId: number; credentialId: string },
): Promise<AuthResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(
    `${FINALIZE_RATE_LIMIT_KEY}:${ip}`,
    FINALIZE_RATE_LIMIT,
    FINALIZE_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'found:finalize', ip });
    return authFailure();
  }

  if (
    typeof input?.adminId !== 'number' ||
    !Number.isFinite(input.adminId) ||
    typeof input?.credentialId !== 'string' ||
    input.credentialId.length === 0
  ) {
    logAuthFailure('finalize_bad_input', { scope: 'found:finalize' });
    return authFailure();
  }

  // If the caller already has a session, refuse. Prevents double-finalize
  // and blocks a hypothetical replay where an attacker already logged in
  // with some other account and is now trying to mint a second session.
  const existing = await auth();
  if (existing) {
    logAuthFailure('finalize_already_authenticated', { scope: 'found:finalize' });
    return authFailure();
  }

  const db = getDb();
  const adminRows = db.select().from(admins).where(eq(admins.id, input.adminId)).all();
  const admin = adminRows[0];
  if (!admin) {
    logAuthFailure('finalize_admin_not_found', { scope: 'found:finalize' });
    return authFailure();
  }
  if (!admin.active || !admin.enrolledAt) {
    logAuthFailure('finalize_admin_not_ready', { scope: 'found:finalize' });
    return authFailure();
  }

  const enrolledAtMs = Date.parse(admin.enrolledAt);
  if (!Number.isFinite(enrolledAtMs)) {
    logAuthFailure('finalize_enrolled_at_unparseable', { scope: 'found:finalize' });
    return authFailure();
  }
  if (Date.now() - enrolledAtMs > FOUNDING_FINALIZE_MAX_AGE_MS) {
    logAuthFailure('finalize_stale', { scope: 'found:finalize' });
    return authFailure();
  }

  // Verify the credential belongs to this admin. Ties the finalize call to
  // the ceremony that just happened — an attacker needs both adminId AND
  // credentialId, and the credentialId was only ever returned to the
  // original client inside the finishFoundingEnrollment response.
  const credRows = db
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, input.credentialId))
    .all();
  const cred = credRows[0];
  if (!cred || cred.adminId !== admin.id) {
    logAuthFailure('finalize_credential_mismatch', { scope: 'found:finalize' });
    return authFailure();
  }

  try {
    await signIn('webauthn', {
      email: admin.email,
      redirect: false,
      credentialId: cred.credentialId,
    });
  } catch (err) {
    logAuthFailure('finalize_signin_failed', {
      scope: 'found:finalize',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk();
}
