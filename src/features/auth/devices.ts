'use server';

/**
 * Multi-device passkey management for an already-authenticated admin
 * (issue #77). Exposes server actions for the `/admin/settings/devices` page:
 *
 *   - `listMyDevices()` — enumerates the current admin's passkeys
 *   - `startAddDevice()` / `finishAddDevice()` — the add-another-device WebAuthn
 *     registration ceremony. Always runs under an authenticated session —
 *     no email-by-email gate — because the caller is already logged in.
 *   - `removeDevice()` — deletes a credential, with two load-bearing guards:
 *       1. REJECTS when it would leave the admin with zero credentials
 *          (can't-lock-yourself-out invariant)
 *       2. REJECTS when the target is the admin's current-session credential
 *          (defense in depth — UI also hides the button)
 *     On success also deletes any session rows tied to that credential, so
 *     a stolen device's cookie is invalidated immediately.
 *   - `renameDevice()` — updates the human-friendly label.
 *
 * Every action verifies the caller is an authenticated admin AND that the
 * credential they're touching is owned by that admin. A credentialId supplied
 * by the client is never trusted to implicitly identify "this admin's
 * device"; we always join through the session's user → admins row.
 */

import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  admins,
  credentials,
  sessions,
  type CredentialRow,
} from '@/db/schema';
import { auth } from './auth';
import { findAdminByEmail, listCredentialsForAdmin } from './admin-queries';
import { consumeChallenge, saveChallenge } from './challenges';
import { getRelyingParty } from './relying-party';
import { authFailure, authOk, logAuthFailure, type AuthResult } from './response';
import {
  labelSchema,
  optionalLabelSchema,
  type DeviceView,
} from './devices-shared';

type AdminContext = {
  adminId: number;
  currentCredentialId: string | null;
};

/**
 * Resolve the current admin from the session, or return null if the caller
 * is not authenticated as an active+enrolled admin. All device-management
 * actions funnel through this so auth is checked in exactly one place.
 *
 * The session cookie is the only trust boundary. `credentialId` passed in by
 * the client is compared against DB rows owned by this admin — it never
 * implicitly grants access.
 */
async function requireAdmin(): Promise<AdminContext | null> {
  const session = await auth();
  if (!session) return null;
  const admin = findAdminByEmail(session.user.email);
  if (!admin || !admin.active || !admin.enrolledAt) return null;
  return {
    adminId: admin.id,
    currentCredentialId: session.credentialId,
  };
}

function toDeviceView(
  row: CredentialRow,
  currentCredentialId: string | null,
): DeviceView {
  return {
    id: row.id,
    credentialId: row.credentialId,
    label: row.label ?? null,
    deviceType: row.deviceType ?? null,
    createdAt: row.createdAt,
    isThisDevice:
      currentCredentialId !== null && row.credentialId === currentCredentialId,
  };
}

/**
 * List the current admin's passkeys, newest first. `isThisDevice` is true
 * for exactly the row whose credentialId matches the session's
 * credentialId — a session created by a device that's since been removed
 * will show every row as not-this-device.
 */
export async function listMyDevices(): Promise<DeviceView[]> {
  const ctx = await requireAdmin();
  if (!ctx) return [];

  const rows = listCredentialsForAdmin(ctx.adminId);
  // Sort by created_at desc; ISO-8601 strings sort lexicographically by time.
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return rows.map((r) => toDeviceView(r, ctx.currentCredentialId));
}

/**
 * Begin WebAuthn registration for an additional device. Always runs inside
 * an authenticated session — no env gate — because the admin is already
 * signed in via the settings page.
 *
 * `excludeCredentials` lists every credentialId already registered to this
 * admin so the browser refuses to re-register the same authenticator (which
 * would produce a duplicate row on the admin, not the desired "added a
 * second device" outcome).
 */
export async function startAddDevice(): Promise<
  AuthResult<{ options: Awaited<ReturnType<typeof generateRegistrationOptions>> }>
> {
  const ctx = await requireAdmin();
  if (!ctx) {
    logAuthFailure('not_authenticated', { scope: 'devices:startAdd' });
    return authFailure();
  }

  const db = getDb();
  const adminRow = db.select().from(admins).where(eq(admins.id, ctx.adminId)).all()[0];
  if (!adminRow) {
    logAuthFailure('admin_row_missing', { scope: 'devices:startAdd' });
    return authFailure();
  }

  const existing = listCredentialsForAdmin(ctx.adminId);
  const { rpID, rpName } = getRelyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: adminRow.email,
    userDisplayName: adminRow.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    // Feed in every known credentialId so the authenticator (and browser)
    // refuses the ceremony on a device that's already registered. WebAuthn
    // spec: an authenticator that matches any excluded ID must abort with
    // InvalidStateError before producing an attestation.
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
  });

  saveChallenge('addDevice', adminRow.email, options.challenge);
  return authOk({ options });
}

/**
 * Complete the add-device ceremony. Verifies the attestation, persists the
 * new row under the CURRENT admin's id (never a client-supplied admin_id),
 * and optionally records the provided label.
 *
 * Label is optional; when omitted the UI displays the row's `deviceType`.
 */
export async function finishAddDevice(
  response: RegistrationResponseJSON,
  label?: string,
): Promise<AuthResult<{ credentialId: string }>> {
  const ctx = await requireAdmin();
  if (!ctx) {
    logAuthFailure('not_authenticated', { scope: 'devices:finishAdd' });
    return authFailure();
  }

  const db = getDb();
  const adminRow = db.select().from(admins).where(eq(admins.id, ctx.adminId)).all()[0];
  if (!adminRow) {
    logAuthFailure('admin_row_missing', { scope: 'devices:finishAdd' });
    return authFailure();
  }

  const parsedLabel = optionalLabelSchema.safeParse(label);
  if (!parsedLabel.success) {
    logAuthFailure('label_invalid', { scope: 'devices:finishAdd' });
    return authFailure();
  }
  const normalizedLabel =
    parsedLabel.data && parsedLabel.data.length > 0 ? parsedLabel.data : null;

  const expectedChallenge = consumeChallenge('addDevice', adminRow.email);
  if (!expectedChallenge) {
    logAuthFailure('challenge_missing', { scope: 'devices:finishAdd' });
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
      scope: 'devices:finishAdd',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  if (!verification.verified || !verification.registrationInfo) {
    logAuthFailure('verify_false', { scope: 'devices:finishAdd' });
    return authFailure();
  }

  const info = verification.registrationInfo;
  const cred = info.credential;
  const publicKeyB64 = Buffer.from(cred.publicKey).toString('base64');

  try {
    db.insert(credentials)
      .values({
        adminId: ctx.adminId,
        credentialId: cred.id,
        publicKey: publicKeyB64,
        counter: cred.counter,
        deviceType: info.credentialDeviceType,
        label: normalizedLabel,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    logAuthFailure('credential_insert_failed', {
      scope: 'devices:finishAdd',
      error: err instanceof Error ? err.message : String(err),
    });
    return authFailure();
  }

  return authOk({ credentialId: cred.id });
}

/**
 * Remove a credential from the current admin.
 *
 * Security: `credentialId` is a client-supplied value. It is NEVER trusted
 * to name an admin — we always re-verify the target row's `admin_id`
 * matches the session's admin. Cross-admin authorization is enforced here.
 *
 * Guards (in order):
 *   1. target row must exist AND belong to the current admin (authz)
 *   2. count > 1 — never let an admin remove their last passkey and
 *      lock themselves out
 *   3. target is not the credential the current session was established
 *      with — defense in depth on top of the UI hiding the button
 *
 * On success, also deletes every session row whose `credentialId` matches
 * the removed credential. A 30-day session cookie from a stolen device
 * would otherwise remain valid even after the admin revoked that device
 * from their list.
 */
export async function removeDevice(
  credentialId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: 'not_authenticated' | 'not_found' | 'last_device' | 'is_current_device';
    }
> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, reason: 'not_authenticated' };

  const db = getDb();

  // Authorization: the row must exist AND belong to this admin. Bail with
  // the same `not_found` for both missing-row and cross-admin-admin-B-owns-it
  // so the response doesn't leak existence of other admins' credentials.
  const target = db
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, credentialId))
    .all()[0];
  if (!target || target.adminId !== ctx.adminId) {
    logAuthFailure('credential_not_owned', {
      scope: 'devices:remove',
      adminId: ctx.adminId,
    });
    return { ok: false, reason: 'not_found' };
  }

  // Last-device guard — load-bearing. Count AFTER the authz check so an
  // attacker can't use the count as a probe. Count before the delete.
  const ownedCount = db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.adminId, ctx.adminId))
    .all().length;
  if (ownedCount <= 1) {
    return { ok: false, reason: 'last_device' };
  }

  // Self-revoke guard: an admin can't remove the passkey their current
  // session was established with. The UI also hides the button; this is
  // the API-level enforcement.
  if (
    ctx.currentCredentialId !== null &&
    ctx.currentCredentialId === credentialId
  ) {
    return { ok: false, reason: 'is_current_device' };
  }

  // Delete the credential row + any session rows tied to it. Two statements,
  // not a transaction — better-sqlite3 runs each statement atomically and
  // the session cleanup is only additive security; the credential removal
  // is the operation the admin asked for.
  db.delete(credentials).where(eq(credentials.id, target.id)).run();
  db.delete(sessions).where(eq(sessions.credentialId, credentialId)).run();

  return { ok: true };
}

/**
 * Rename a credential. Authorization identical to `removeDevice` — the
 * target row must belong to the current admin. Label is validated against
 * the same Zod schema as the add-device flow (trimmed, 1-50 chars,
 * non-empty).
 */
export async function renameDevice(
  credentialId: string,
  label: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: 'not_authenticated' | 'not_found' | 'invalid_label';
      message?: string;
    }
> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, reason: 'not_authenticated' };

  const parsed = labelSchema.safeParse(label);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid_label',
      message: parsed.error.issues[0]?.message ?? 'Invalid label',
    };
  }

  const db = getDb();
  const target = db
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, credentialId))
    .all()[0];
  if (!target || target.adminId !== ctx.adminId) {
    logAuthFailure('credential_not_owned', {
      scope: 'devices:rename',
      adminId: ctx.adminId,
    });
    return { ok: false, reason: 'not_found' };
  }

  db.update(credentials)
    .set({ label: parsed.data })
    .where(and(eq(credentials.id, target.id), eq(credentials.adminId, ctx.adminId)))
    .run();

  return { ok: true };
}
