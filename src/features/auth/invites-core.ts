/**
 * Non-server-action core of the admin invites feature (issue #83).
 *
 * Exposes the synchronous primitives used by `invites.ts` server actions AND
 * by unit tests. A `'use server'` module may only export async functions, so
 * these live here.
 *
 * Nothing in this file performs network IO or rate-limiting — the callers
 * (server actions) layer those on top.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { adminInvites, admins, credentials, recoveryCodes } from '@/db/schema';
import type { AdminInviteRow } from '@/db/schema';
import {
  INVITE_TTL_MS,
  deriveStatus,
  type InviteStatus,
  type InviteView,
  normalizeEmail,
} from './invites-shared';

/** Random URL-safe token (UUID v4). */
export function generateInviteToken(): string {
  return randomUUID();
}

export type CreateInviteInput = {
  invitedEmail: string;
  label: string | null;
  createdByAdminId: number;
  /** Injectable for tests. */
  now?: Date;
  /** Injectable for tests. */
  token?: string;
};

/**
 * Insert a fresh invite row. Returns the persisted row.
 *
 * Caller is responsible for verifying `createdByAdminId` belongs to the
 * current session AND that no active enrolled admin already exists for the
 * target email.
 */
export function createInvite(
  db: BetterSQLite3Database<Record<string, unknown>>,
  input: CreateInviteInput,
): AdminInviteRow {
  const email = normalizeEmail(input.invitedEmail);
  const now = input.now ?? new Date();
  const createdAtIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const token = input.token ?? generateInviteToken();

  const inserted = db
    .insert(adminInvites)
    .values({
      token,
      invitedEmail: email,
      label: input.label && input.label.trim().length > 0 ? input.label.trim() : null,
      createdByAdminId: input.createdByAdminId,
      expiresAt: expiresAtIso,
      createdAt: createdAtIso,
    })
    .returning()
    .all();

  return inserted[0]!;
}

/** Load every invite row, newest first. Status is derived at render time. */
export function listInvites(
  db: BetterSQLite3Database<Record<string, unknown>>,
  nowIso: string = new Date().toISOString(),
): InviteView[] {
  const rows = db
    .select()
    .from(adminInvites)
    .orderBy(desc(adminInvites.createdAt))
    .all();

  if (rows.length === 0) return [];

  // Batch-resolve admin emails for created_by + used_by. Keeps the list page
  // to one query + one admins lookup regardless of how many invites exist.
  const adminIds = new Set<number>();
  for (const r of rows) {
    adminIds.add(r.createdByAdminId);
    if (r.usedByAdminId) adminIds.add(r.usedByAdminId);
  }

  const adminRows = db.select().from(admins).all();
  const emailById = new Map(adminRows.map((a) => [a.id, a.email ?? null] as const));

  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    invitedEmail: row.invitedEmail,
    label: row.label,
    status: deriveStatus(row, nowIso),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    usedByEmail: row.usedByAdminId ? (emailById.get(row.usedByAdminId) ?? null) : null,
    revokedAt: row.revokedAt,
    createdByEmail: emailById.get(row.createdByAdminId) ?? null,
  }));
}

/**
 * Revoke an invite by its full token (UI) or by a short prefix (CLI). The
 * prefix variant is CLI-only and requires a minimum length to avoid
 * accidentally revoking the wrong row.
 */
export function revokeInviteByToken(
  db: BetterSQLite3Database<Record<string, unknown>>,
  token: string,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: 'not_found' | 'already_terminal' } {
  const nowIso = now.toISOString();
  const rows = db
    .select()
    .from(adminInvites)
    .where(eq(adminInvites.token, token))
    .all();

  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };

  const status = deriveStatus(row, nowIso);
  if (status !== 'pending' && status !== 'expired') {
    // Already used or revoked — no-op on used; idempotent "already revoked."
    if (status === 'revoked') return { ok: true };
    return { ok: false, reason: 'already_terminal' };
  }

  db.update(adminInvites)
    .set({ revokedAt: nowIso })
    .where(eq(adminInvites.id, row.id))
    .run();

  return { ok: true };
}

/** Minimum required length of a prefix for CLI revocation. */
export const INVITE_TOKEN_PREFIX_MIN = 6;

/**
 * Find a single invite whose token starts with `prefix`, for CLI revocation.
 * Returns null for zero matches or > 1 matches (ambiguous — caller reports).
 */
export function findInviteByTokenPrefix(
  db: BetterSQLite3Database<Record<string, unknown>>,
  prefix: string,
):
  | { kind: 'none' }
  | { kind: 'ambiguous'; count: number }
  | { kind: 'one'; row: AdminInviteRow } {
  if (prefix.length < INVITE_TOKEN_PREFIX_MIN) {
    return { kind: 'none' };
  }
  const all = db.select().from(adminInvites).all();
  const matches = all.filter((r) => r.token.startsWith(prefix));
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length > 1) return { kind: 'ambiguous', count: matches.length };
  return { kind: 'one', row: matches[0]! };
}

export type ValidateInviteResult =
  | { ok: true; row: AdminInviteRow }
  | { ok: false; status: Exclude<InviteStatus, 'pending'> | 'unknown' };

/**
 * Read-only validation of an invite token. Callers that intend to accept the
 * invite must re-run the validity check inside the transaction that
 * mutates `admins` and `admin_invites` — this function exists for
 * informational page renders (`/admin/signup?token=...`) and for early
 * rejection in `start` server actions.
 */
export function validateInvite(
  db: BetterSQLite3Database<Record<string, unknown>>,
  token: string,
  nowIso: string = new Date().toISOString(),
): ValidateInviteResult {
  const rows = db
    .select()
    .from(adminInvites)
    .where(eq(adminInvites.token, token))
    .all();
  const row = rows[0];
  if (!row) return { ok: false, status: 'unknown' };
  const status = deriveStatus(row, nowIso);
  if (status !== 'pending') return { ok: false, status };
  return { ok: true, row };
}

export type AcceptInviteInput = {
  token: string;
  /** Email the client submitted — compared case-insensitively to invited_email. */
  submittedEmail: string;
  /** Display name supplied by the invitee. Trimmed by the caller. */
  name?: string | null;
  credential: {
    credentialId: string;
    publicKeyB64: string;
    counter: number;
    deviceType: string | null;
  };
  hashedRecoveryCode: string;
  now?: Date;
};

export type AcceptInviteResult =
  | { ok: true; adminId: number; email: string }
  | { ok: false };

/**
 * Atomic invite acceptance. Inside a single SQLite transaction:
 *
 *   1. Re-loads the invite row with a fresh read.
 *   2. Re-validates: exists + not revoked + not used + not expired.
 *   3. Verifies the submitted email matches `invited_email` case-insensitively.
 *   4. Inserts a new `admins` row (active + enrolled_at=now). The UNIQUE
 *      email constraint guards against an accidental second admin row for
 *      the same email.
 *   5. Inserts the credential row.
 *   6. Inserts the recovery-code row.
 *   7. Marks the invite `used_at=now, used_by_admin_id=<newAdminId>`.
 *
 * Any failure causes the transaction to roll back. The caller learns success
 * or the canonical failure — never which specific step tripped, to avoid
 * leaking invite existence / invitee email.
 */
export function acceptInvite(
  sqlite: Database.Database,
  db: BetterSQLite3Database<Record<string, unknown>>,
  input: AcceptInviteInput,
): AcceptInviteResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const submittedNormalized = normalizeEmail(input.submittedEmail);

  let adminId = 0;
  let finalEmail = '';
  try {
    const tx = sqlite.transaction(() => {
      // Step 1: re-read the invite row inside the tx.
      const rows = db
        .select()
        .from(adminInvites)
        .where(eq(adminInvites.token, input.token))
        .all();
      const row = rows[0];
      if (!row) throw new Error('invite_unknown');

      // Step 2: re-derive status from the row as it sits in the tx snapshot.
      const status = deriveStatus(row, nowIso);
      if (status !== 'pending') throw new Error(`invite_${status}`);

      // Step 3: case-insensitive email binding. `invited_email` is stored
      // lowercased at create time; compare against the lowercased submission.
      if (row.invitedEmail.toLowerCase() !== submittedNormalized) {
        throw new Error('invite_email_mismatch');
      }
      finalEmail = row.invitedEmail.toLowerCase();

      // Step 4: insert the new admin row. An existing active admin with the
      // same email would trip the UNIQUE constraint and fail the tx — good,
      // canonical failure.
      const inserted = db
        .insert(admins)
        .values({
          email: finalEmail,
          name: input.name?.trim() ? input.name.trim() : null,
          active: 1,
          enrolledAt: nowIso,
          createdAt: nowIso,
        })
        .returning({ id: admins.id })
        .all();
      const newAdminId = inserted[0]?.id;
      if (!newAdminId) throw new Error('admin_insert_returned_no_id');

      // Step 5: insert credential.
      db.insert(credentials)
        .values({
          adminId: newAdminId,
          credentialId: input.credential.credentialId,
          publicKey: input.credential.publicKeyB64,
          counter: input.credential.counter,
          deviceType: input.credential.deviceType,
          createdAt: nowIso,
        })
        .run();

      // Step 6: insert recovery code.
      db.insert(recoveryCodes)
        .values({
          adminId: newAdminId,
          codeHash: input.hashedRecoveryCode,
          createdAt: nowIso,
        })
        .run();

      // Step 7: mark invite used. Guard with `revokedAt IS NULL AND used_at
      // IS NULL` so an admin row stays consistent even in a weird concurrent
      // case — if the update affects zero rows we roll back.
      const updated = db
        .update(adminInvites)
        .set({ usedAt: nowIso, usedByAdminId: newAdminId })
        .where(
          and(
            eq(adminInvites.id, row.id),
            isNull(adminInvites.usedAt),
            isNull(adminInvites.revokedAt),
          ),
        )
        .returning({ id: adminInvites.id })
        .all();
      if (updated.length === 0) throw new Error('invite_update_conflict');

      adminId = newAdminId;
    });
    tx();
  } catch {
    return { ok: false };
  }

  return { ok: true, adminId, email: finalEmail };
}
