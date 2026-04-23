/**
 * DB lookups against the `admins` and `credentials` tables.
 *
 * Ticket 1A (#29) owns the schema + reconciliation; this module is read-only
 * from the 1B side — it never inserts or soft-disables admins, that's 1A's
 * job via `reconcileAdmins()` on boot.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins, credentials, type AdminRow, type CredentialRow } from '@/db/schema';

/**
 * Look up an admin by email (case-insensitive).
 *
 * Returns null when the lookup input is empty or not a string. A
 * pre-0025 admin row that was enrolled during the single-admin era
 * carries NULL email; the caller shouldn't be able to "authenticate as
 * a null-email admin" by passing in an empty string, so we short-circuit
 * at the input boundary.
 */
export function findAdminByEmail(email: string | null | undefined): AdminRow | null {
  if (typeof email !== 'string' || email.length === 0) return null;
  const lower = email.toLowerCase();
  const rows = getDb().select().from(admins).where(eq(admins.email, lower)).all();
  return rows[0] ?? null;
}

export type AdminStatus = 'unknown' | 'disabled' | 'pending' | 'enrolled';

/**
 * Classify an admin's state in one call. Used by server actions to gate
 * access paths (enrollment vs. login).
 */
export function classifyAdmin(
  email: string | null | undefined,
): { status: AdminStatus; admin: AdminRow | null } {
  const admin = findAdminByEmail(email);
  if (!admin) return { status: 'unknown', admin: null };
  if (!admin.active) return { status: 'disabled', admin };
  if (!admin.enrolledAt) return { status: 'pending', admin };
  return { status: 'enrolled', admin };
}

/** All credentials rows for an admin. */
export function listCredentialsForAdmin(adminId: number): CredentialRow[] {
  return getDb().select().from(credentials).where(eq(credentials.adminId, adminId)).all();
}

/** Find a specific credential by its base64url credentialID. */
export function findCredentialById(credentialId: string): CredentialRow | null {
  const rows = getDb()
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, credentialId))
    .all();
  return rows[0] ?? null;
}
