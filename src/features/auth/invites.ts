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
import { getDb, getSqlite } from '@/db';
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
  response: RegistrationResponseJSON,
): Promise<AuthResult<{ recoveryCode: string; adminId: number }>> {
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

  // Establish the session so the new admin lands on /admin after dismissing
  // the recovery-code modal. Re-uses the shared signIn shim for parity with
  // the founding + login flows.
  try {
    await signIn('webauthn', {
      email: result.email,
      redirect: false,
      credentialId: cred.id,
    });
  } catch (err) {
    logAuthFailure('signin_after_accept_failed', {
      scope: 'invites:accept:finish',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk({ recoveryCode: plaintextRecovery, adminId: result.adminId });
}
