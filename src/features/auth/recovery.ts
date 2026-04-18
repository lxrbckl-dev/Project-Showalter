/**
 * Recovery code generation, hashing, verification, and rotation.
 *
 * Rules (per STACK.md):
 *   - Exactly one active (unused) code per admin at any time — enforced by
 *     the `recovery_codes_active` partial UNIQUE index created in 1A's
 *     migration.
 *   - Codes are shown in plaintext ONCE (at enrollment, and once after a
 *     successful recovery-rotate).
 *   - Codes are stored hashed at rest.
 */

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { recoveryCodes, type RecoveryCodeRow } from '@/db/schema';

const CODE_LENGTH = 12;
const BCRYPT_ROUNDS = 10;

// Plaintext format: 12 chars, uppercase A–Z + 2–9 (Crockford-ish alphabet).
// Omits O / 0 / I / 1 to avoid read-aloud confusion. Easy to copy off a
// screen, impractical to brute-force.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Returns a random 12-character plaintext recovery code. */
export function generatePlaintextCode(): string {
  const buf = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

export async function hashCode(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyHash(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Generate, hash, and persist a new recovery code for the given admin.
 * Returns the plaintext for one-time display.
 *
 * Assumes any previous active code has already been marked `used_at`
 * (the partial UNIQUE index prevents two active codes per admin).
 */
export async function issueRecoveryCode(adminId: number): Promise<string> {
  const plaintext = generatePlaintextCode();
  const hash = await hashCode(plaintext);
  getDb()
    .insert(recoveryCodes)
    .values({
      adminId,
      codeHash: hash,
      createdAt: new Date().toISOString(),
    })
    .run();
  return plaintext;
}

/** Fetch the active (unused) recovery code row for an admin. */
export function findActiveCode(adminId: number): RecoveryCodeRow | null {
  const rows = getDb()
    .select()
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.adminId, adminId), isNull(recoveryCodes.usedAt)))
    .all();
  return rows[0] ?? null;
}

/**
 * Verify + rotate a recovery code.
 *
 * On success: marks the supplied code `used_at=now`, generates a fresh one,
 * inserts it, and returns `{ ok: true, newCode }` with the plaintext.
 * On failure: returns `{ ok: false }` with no side effects.
 *
 * Caller is responsible for establishing a session on success.
 */
export async function useRecoveryCode(
  adminId: number,
  plaintext: string,
): Promise<{ ok: true; newCode: string } | { ok: false }> {
  const active = findActiveCode(adminId);
  if (!active) return { ok: false };

  const match = await verifyHash(plaintext, active.codeHash);
  if (!match) return { ok: false };

  // Mark used. Do this BEFORE generating the replacement so the partial
  // UNIQUE index doesn't collide.
  getDb()
    .update(recoveryCodes)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(recoveryCodes.id, active.id))
    .run();

  const newCode = await issueRecoveryCode(adminId);
  return { ok: true, newCode };
}
