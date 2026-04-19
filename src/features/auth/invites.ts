'use server';

/**
 * Admin invite-link server actions (issue #83).
 *
 * Four public actions:
 *
 *   - `generateInvite(input)`     — authenticated admin creates a new invite
 *   - `listInvitesForUi()`        — authenticated admin lists every invite
 *   - `revokeInvite(token)`       — authenticated admin revokes
 *   - `startAcceptInvite(token, email)` + `finishAcceptInvite(token, email,
 *     response)` — invitee accepts the invite with a WebAuthn ceremony
 *
 * Security posture:
 *   - Every admin-only action funnels through `requireAdmin()` (same pattern
 *     as `devices.ts`) so auth is checked in exactly one place.
 *   - `finishAcceptInvite` re-validates the invite AND the email binding
 *     INSIDE a SQLite transaction (via `acceptInvite` in `invites-core.ts`),
 *     not trusting the `start` action or page render.
 *   - All failure paths return the canonical `authFailure()` shape. Real
 *     reason is logged via `logAuthFailure`.
 */

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { getDb, getSqlite } from '@/db';
import { admins, credentials } from '@/db/schema';
import { auth } from './auth';
import { findAdminByEmail } from './admin-queries';
import { consumeChallenge, saveChallenge } from './challenges';
import { getClientIp } from './client-ip';
import { getRelyingParty } from './relying-party';
import { hashCode, generatePlaintextCode } from './recovery';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import { checkRateLimit } from '@/lib/rate-limit';
import { signIn } from './auth';
import {
  emailSchema,
  labelSchema,
  normalizeEmail,
  type InviteView,
} from './invites-shared';
import {
  acceptInvite,
  createInvite,
  listInvites,
  revokeInviteByToken,
  validateInvite,
} from './invites-core';

const RATE_LIMIT_KEY = 'invite';
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;

/**
 * Finalize has its own bucket — mirrors the approach in `found.ts`. Keeps
 * the invitee-accept rate limit from double-counting the session-mint step
 * that now runs after the recovery-code modal dismissal.
 */
const FINALIZE_RATE_LIMIT_KEY = 'inviteFinalize';
const FINALIZE_RATE_LIMIT = 20;
const FINALIZE_RATE_WINDOW_MS = 10 * 60_000;

/**
 * Max age of `admins.enrolled_at` at which `finalizeInviteSession` will
 * still mint a session. Same role as `FOUNDING_FINALIZE_MAX_AGE_MS` in
 * `found.ts` — caps the replay window on a stolen finalize tuple.
 */
const INVITE_FINALIZE_MAX_AGE_MS = 10 * 60_000;

type AdminCtx = { adminId: number };

/**
 * Resolve the current authenticated + enrolled admin, or return null.
 *
 * Mirrors the admission check in `devices.ts` — an admin_id supplied by the
 * client is never trusted; we always walk session → user → admins row.
 */
async function requireAdmin(): Promise<AdminCtx | null> {
  const session = await auth();
  if (!session) return null;
  const admin = findAdminByEmail(session.user.email);
  if (!admin || !admin.active || !admin.enrolledAt) return null;
  return { adminId: admin.id };
}

export type GenerateInviteInput = {
  email: string;
  label?: string;
};

/**
 * Create a new invite. Called by the Create Invite form on
 * `/admin/settings/admins`.
 */
export async function generateInvite(
  input: GenerateInviteInput,
): Promise<
  AuthResult<{ token: string; invitedEmail: string; expiresAt: string }>
> {
  const ctx = await requireAdmin();
  if (!ctx) {
    logAuthFailure('not_authenticated', { scope: 'invites:generate' });
    return authFailure();
  }

  const parsedEmail = emailSchema.safeParse(input.email);
  if (!parsedEmail.success) {
    return {
      ok: false,
      message: parsedEmail.error.issues[0]?.message ?? 'Enter a valid email address',
    };
  }

  const parsedLabel = labelSchema.optional().safeParse(input.label ?? undefined);
  if (!parsedLabel.success) {
    return {
      ok: false,
      message: parsedLabel.error.issues[0]?.message ?? 'Invalid label',
    };
  }

  const normalizedEmail = normalizeEmail(parsedEmail.data);
  const label =
    parsedLabel.data && parsedLabel.data.trim().length > 0
      ? parsedLabel.data.trim()
      : null;

  // Light sanity check — don't offer to invite somebody who is already an
  // enrolled admin on this server. (Still allowed to invite a disabled admin
  // if you want to rotate them, but that's niche — keep the UX simple.)
  const existing = findAdminByEmail(normalizedEmail);
  if (existing && existing.active) {
    return {
      ok: false,
      message: 'That email is already an active admin.',
    };
  }

  const row = createInvite(getDb(), {
    invitedEmail: normalizedEmail,
    label,
    createdByAdminId: ctx.adminId,
  });

  return authOk({
    token: row.token,
    invitedEmail: row.invitedEmail,
    expiresAt: row.expiresAt,
  });
}

/** List every invite with status derived for UI render. */
export async function listInvitesForUi(): Promise<InviteView[]> {
  const ctx = await requireAdmin();
  if (!ctx) return [];
  return listInvites(getDb());
}

/** Revoke by full token (UI action). */
export async function revokeInvite(
  token: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: 'not_authenticated' | 'not_found' | 'already_terminal' }
> {
  const ctx = await requireAdmin();
  if (!ctx) {
    logAuthFailure('not_authenticated', { scope: 'invites:revoke' });
    return { ok: false, reason: 'not_authenticated' };
  }

  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'not_found' };
  }

  const res = revokeInviteByToken(getDb(), token);
  if (!res.ok) return { ok: false, reason: res.reason };
  return { ok: true };
}

/** Read-only invite lookup used by `/admin/signup` page render. */
export async function lookupInviteForSignup(token: string): Promise<
  | { ok: true; invitedEmail: string; expiresAt: string; label: string | null }
  | { ok: false }
> {
  if (typeof token !== 'string' || token.length === 0) return { ok: false };
  const res = validateInvite(getDb(), token);
  if (!res.ok) {
    logAuthFailure('invite_invalid', { scope: 'invites:lookup', status: res.status });
    return { ok: false };
  }
  return {
    ok: true,
    invitedEmail: res.row.invitedEmail,
    expiresAt: res.row.expiresAt,
    label: res.row.label,
  };
}

export async function startAcceptInvite(
  token: string,
  email: string,
): Promise<
  AuthResult<{ options: Awaited<ReturnType<typeof generateRegistrationOptions>> }>
> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'invites:accept:start', ip });
    return authFailure();
  }

  if (typeof token !== 'string' || token.length === 0) {
    logAuthFailure('invite_token_missing', { scope: 'invites:accept:start' });
    return authFailure();
  }

  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) {
    logAuthFailure('invalid_email', { scope: 'invites:accept:start' });
    return authFailure();
  }
  const normalized = normalizeEmail(parsedEmail.data);

  const invite = validateInvite(getDb(), token);
  if (!invite.ok) {
    logAuthFailure('invite_invalid', {
      scope: 'invites:accept:start',
      status: invite.status,
    });
    return authFailure();
  }

  // Pre-check email binding. The authoritative re-check happens inside the
  // transaction in finishAcceptInvite, but rejecting here avoids issuing a
  // challenge for a doomed ceremony.
  if (invite.row.invitedEmail.toLowerCase() !== normalized) {
    logAuthFailure('invite_email_mismatch', { scope: 'invites:accept:start' });
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

  // Scope the challenge by the invite token so two concurrent invitees don't
  // collide, and so an invite's challenge is invalidated if the same email
  // is reissued a second invite.
  saveChallenge('acceptInvite', `${token}:${normalized}`, options.challenge);
  return authOk({ options });
}

export async function finishAcceptInvite(
  token: string,
  email: string,
  name: string,
  response: RegistrationResponseJSON,
): Promise<
  AuthResult<{ recoveryCode: string; adminId: number; credentialId: string }>
> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`${RATE_LIMIT_KEY}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'invites:accept:finish', ip });
    return authFailure();
  }

  if (typeof token !== 'string' || token.length === 0) {
    return authFailure();
  }

  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) return authFailure();
  const normalized = normalizeEmail(parsedEmail.data);

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    logAuthFailure('invalid_name', { scope: 'invites:accept:finish' });
    return authFailure();
  }

  const expectedChallenge = consumeChallenge(
    'acceptInvite',
    `${token}:${normalized}`,
  );
  if (!expectedChallenge) {
    logAuthFailure('challenge_missing', { scope: 'invites:accept:finish' });
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
      scope: 'invites:accept:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  if (!verification.verified || !verification.registrationInfo) {
    logAuthFailure('verify_false', { scope: 'invites:accept:finish' });
    return authFailure();
  }

  const info = verification.registrationInfo;
  const cred = info.credential;
  const publicKeyB64 = Buffer.from(cred.publicKey).toString('base64');

  const plaintextRecovery = generatePlaintextCode();
  const hashedRecovery = await hashCode(plaintextRecovery);

  const result = acceptInvite(getSqlite(), getDb(), {
    token,
    submittedEmail: normalized,
    name: trimmedName,
    credential: {
      credentialId: cred.id,
      publicKeyB64,
      counter: cred.counter,
      deviceType: info.credentialDeviceType ?? null,
    },
    hashedRecoveryCode: hashedRecovery,
  });

  if (!result.ok) {
    logAuthFailure('accept_invite_tx_failed', { scope: 'invites:accept:finish' });
    return authFailure();
  }

  // IMPORTANT: do NOT mint the session here. Same reasoning as
  // `finishFoundingEnrollment` in `found.ts` — setting a session cookie from
  // a server action triggers an RSC refresh, which unmounts the signup form
  // before the client can flush `stage = 'recovery-modal'`, destroying the
  // one-time recovery code before the user sees it.
  //
  // The new admin row exists without a session. The client mints the session
  // via `finalizeInviteSession` after the recovery-code modal is dismissed.
  return authOk({
    recoveryCode: plaintextRecovery,
    adminId: result.adminId,
    credentialId: cred.id,
  });
}

/**
 * Finalize an invite-accept enrollment by minting a session.
 *
 * Mirrors `finalizeFoundingSession` in `found.ts`. Called by the client
 * AFTER the recovery-code modal is dismissed.
 */
export async function finalizeInviteSession(
  input: { adminId: number; credentialId: string },
): Promise<AuthResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(
    `${FINALIZE_RATE_LIMIT_KEY}:${ip}`,
    FINALIZE_RATE_LIMIT,
    FINALIZE_RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    logAuthFailure('rate_limited', { scope: 'invites:finalize', ip });
    return authFailure();
  }

  if (
    typeof input?.adminId !== 'number' ||
    !Number.isFinite(input.adminId) ||
    typeof input?.credentialId !== 'string' ||
    input.credentialId.length === 0
  ) {
    logAuthFailure('finalize_bad_input', { scope: 'invites:finalize' });
    return authFailure();
  }

  // Refuse if the caller already has a session — guards double-finalize and
  // blocks an attacker who is already logged in from stealing another
  // admin's new session.
  const existing = await auth();
  if (existing) {
    logAuthFailure('finalize_already_authenticated', {
      scope: 'invites:finalize',
    });
    return authFailure();
  }

  const db = getDb();
  const adminRows = db.select().from(admins).where(eq(admins.id, input.adminId)).all();
  const admin = adminRows[0];
  if (!admin) {
    logAuthFailure('finalize_admin_not_found', { scope: 'invites:finalize' });
    return authFailure();
  }
  if (!admin.active || !admin.enrolledAt) {
    logAuthFailure('finalize_admin_not_ready', { scope: 'invites:finalize' });
    return authFailure();
  }

  const enrolledAtMs = Date.parse(admin.enrolledAt);
  if (!Number.isFinite(enrolledAtMs)) {
    logAuthFailure('finalize_enrolled_at_unparseable', {
      scope: 'invites:finalize',
    });
    return authFailure();
  }
  if (Date.now() - enrolledAtMs > INVITE_FINALIZE_MAX_AGE_MS) {
    logAuthFailure('finalize_stale', { scope: 'invites:finalize' });
    return authFailure();
  }

  const credRows = db
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, input.credentialId))
    .all();
  const cred = credRows[0];
  if (!cred || cred.adminId !== admin.id) {
    logAuthFailure('finalize_credential_mismatch', {
      scope: 'invites:finalize',
    });
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
      scope: 'invites:finalize',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk();
}
