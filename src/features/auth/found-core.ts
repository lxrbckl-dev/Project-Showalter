/**
 * Non-server-action core of the founding-admin flow. Shared between the
 * `'use server'` `found.ts` actions and unit tests that exercise the
 * transactional guard without the WebAuthn scaffolding.
 *
 * A `'use server'` file may only export async functions; this module houses
 * the synchronous helpers (`foundFirstAdmin`) plus the shared empty-check.
 */

import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { admins, credentials, recoveryCodes } from '@/db/schema';

/** Cheap read-only check — "zero rows in admins?". */
export function adminsTableEmpty(
  db: BetterSQLite3Database<Record<string, unknown>>,
): boolean {
  const rows = db.select({ id: admins.id }).from(admins).limit(1).all();
  return rows.length === 0;
}

export type FoundFirstAdminInput = {
  /** Display name for the new admin (e.g. "Sawyer"). Trimmed by the caller. */
  name?: string | null;
  /** If provided, the credential is recorded as the founding device. */
  credential?: {
    credentialId: string;
    publicKeyB64: string;
    counter: number;
    deviceType: string | null;
  };
  /** If provided, the pre-hashed recovery code is persisted. */
  hashedRecoveryCode?: string;
  /** Injectable for tests. */
  now?: Date;
};

export type FoundFirstAdminResult =
  | { ok: true; adminId: number }
  | { ok: false; reason: 'admins_not_empty' | 'insert_failed' };

/**
 * Atomically (inside a SQLite transaction):
 *   - re-check that `admins` is empty
 *   - INSERT the new admin row as active + enrolled
 *   - optionally INSERT the founding credential + hashed recovery code
 *
 * Returns `{ ok: false, reason: 'admins_not_empty' }` if the table was
 * non-empty at the moment the transaction started — this is the "race
 * loser" path.
 *
 * Returns `{ ok: false, reason: 'insert_failed' }` if any INSERT throws
 * (e.g. a second racing writer slips past the count-check).
 *
 * The caller is responsible for logging, rate limiting, generating +
 * hashing the recovery code, and post-success session minting.
 */
export function foundFirstAdmin(
  sqlite: Database.Database,
  db: BetterSQLite3Database<Record<string, unknown>>,
  input: FoundFirstAdminInput,
): FoundFirstAdminResult {
  const nowIso = (input.now ?? new Date()).toISOString();

  let adminId = 0;
  let failureReason: 'admins_not_empty' | 'insert_failed' | null = null;

  try {
    const tx = sqlite.transaction(() => {
      const count = (
        sqlite.prepare('SELECT COUNT(*) AS c FROM admins').get() as { c: number }
      ).c;
      if (count > 0) {
        failureReason = 'admins_not_empty';
        throw new Error('admins_not_empty_tx');
      }

      const inserted = db
        .insert(admins)
        .values({
          name: input.name?.trim() ? input.name.trim() : null,
          active: 1,
          enrolledAt: nowIso,
          createdAt: nowIso,
        })
        .returning({ id: admins.id })
        .all();

      const id = inserted[0]?.id;
      if (!id) {
        failureReason = 'insert_failed';
        throw new Error('admin_insert_returned_no_id');
      }
      adminId = id;

      if (input.credential) {
        db.insert(credentials)
          .values({
            adminId: id,
            credentialId: input.credential.credentialId,
            publicKey: input.credential.publicKeyB64,
            counter: input.credential.counter,
            deviceType: input.credential.deviceType,
            createdAt: nowIso,
          })
          .run();
      }

      if (input.hashedRecoveryCode) {
        db.insert(recoveryCodes)
          .values({
            adminId: id,
            codeHash: input.hashedRecoveryCode,
            createdAt: nowIso,
          })
          .run();
      }
    });
    tx();
  } catch {
    return { ok: false, reason: failureReason ?? 'insert_failed' };
  }

  return { ok: true, adminId };
}
