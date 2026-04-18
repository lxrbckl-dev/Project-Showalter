/**
 * admin:reset — reset an admin back to pending-enrollment state.
 *
 * Usage: pnpm admin:reset <email>
 *
 * Deletes all credentials and recovery_codes for the admin, then sets
 * enrolled_at = NULL. The admin record itself is preserved (active flag
 * unchanged) so they can re-enroll on next login.
 */

import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { credentials } from '@/db/schema/credentials';
import { recoveryCodes } from '@/db/schema/recovery-codes';
import { eq } from 'drizzle-orm';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: pnpm admin:reset <email>');
    process.exit(1);
  }

  const db = getDb();

  const admin = db.select().from(admins).where(eq(admins.email, email)).get();
  if (!admin) {
    console.error(`Admin not found: ${email}`);
    process.exit(1);
  }

  db.delete(credentials).where(eq(credentials.adminId, admin.id)).run();
  db.delete(recoveryCodes).where(eq(recoveryCodes.adminId, admin.id)).run();
  db.update(admins).set({ enrolledAt: null }).where(eq(admins.id, admin.id)).run();

  console.log(`Reset ${email}: credentials and recovery codes cleared, enrolled_at set to NULL.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
