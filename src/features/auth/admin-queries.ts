/**
 * DB lookups against the `admins` and `credentials` tables.
 *
 * Single-admin install: there's at most one row in `admins`, so all admin
 * lookups boil down to "the lone admin". The pre-existing email-based
 * helpers (`findAdminByEmail`, `classifyAdmin`) were retired in the
 * single-admin refactor; callers that need to gate on active+enrolled now
 * use `findSingleAdmin()`.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins, credentials, type AdminRow, type CredentialRow } from '@/db/schema';

/**
 * Return the single admin row, or null if none exists. Single-admin install
 * means LIMIT 1 is sufficient — there's no second row to disambiguate.
 */
export function findSingleAdmin(): AdminRow | null {
  const rows = getDb().select().from(admins).limit(1).all();
  return rows[0] ?? null;
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
