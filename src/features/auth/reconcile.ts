import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { admins } from '@/db/schema/admins';

/**
 * Reconcile the `admins` table against the authoritative email list.
 *
 * Rules:
 *  - Email in list but not in DB → INSERT with active=1, enrolled_at=NULL.
 *  - Email in DB but not in list → SET active=0 (soft-disable, never delete).
 *  - Email in both → no change.
 *  - Empty / missing list → log a warning and return early (no mutations).
 *
 * @param db        Drizzle database instance
 * @param emailList Authoritative list of admin emails (already trimmed)
 * @returns Summary of actions taken
 */
export async function reconcileAdmins(
  db: BetterSQLite3Database<Record<string, unknown>>,
  emailList: string[],
): Promise<{ added: string[]; disabled: string[]; unchanged: string[] }> {
  const normalized = emailList.map((e) => e.trim().toLowerCase()).filter(Boolean);

  if (normalized.length === 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        timestamp: new Date().toISOString(),
        msg: 'reconcileAdmins: ADMIN_EMAILS is empty or not set — skipping reconciliation',
      }),
    );
    return { added: [], disabled: [], unchanged: [] };
  }

  const existing = db.select().from(admins).all();
  const existingByEmail = new Map(existing.map((row) => [row.email.toLowerCase(), row]));
  const envSet = new Set(normalized);

  const added: string[] = [];
  const disabled: string[] = [];
  const unchanged: string[] = [];

  // Insert emails that are in the env list but missing from DB.
  for (const email of normalized) {
    if (!existingByEmail.has(email)) {
      db.insert(admins)
        .values({
          email,
          active: 1,
          enrolledAt: null,
          createdAt: new Date().toISOString(),
        })
        .run();
      added.push(email);
    } else {
      unchanged.push(email);
    }
  }

  // Soft-disable emails that are in DB but not in env list.
  for (const [email, row] of existingByEmail) {
    if (!envSet.has(email)) {
      if (row.active !== 0) {
        db.update(admins).set({ active: 0 }).where(eq(admins.id, row.id)).run();
        disabled.push(email);
      }
      // Already disabled — counts as unchanged (no re-notification needed)
    }
  }

  console.log(
    JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      msg: 'reconcileAdmins: complete',
      added,
      disabled,
      unchanged,
    }),
  );

  return { added, disabled, unchanged };
}
