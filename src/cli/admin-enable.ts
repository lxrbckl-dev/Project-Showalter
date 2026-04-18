/**
 * admin:enable — re-enable a soft-disabled admin (sets active = 1).
 *
 * Usage: pnpm admin:enable <email>
 *
 * Admins are no longer reconciled from an env list (#83) — a re-enabled
 * admin stays enabled across reboots.
 */

import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { eq } from 'drizzle-orm';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: pnpm admin:enable <email>');
    process.exit(1);
  }

  const db = getDb();

  const admin = db.select().from(admins).where(eq(admins.email, email)).get();
  if (!admin) {
    console.error(`Admin not found: ${email}`);
    process.exit(1);
  }

  db.update(admins).set({ active: 1 }).where(eq(admins.id, admin.id)).run();

  console.log(`Enabled admin: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
