/**
 * admin:disable — soft-disable an admin (sets active = 0).
 *
 * Usage: pnpm admin:disable <email>
 *
 * The admin record is preserved for audit purposes. The admin will not be
 * able to log in while disabled. Re-enable with `pnpm admin:enable <email>`.
 */

import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { eq } from 'drizzle-orm';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: pnpm admin:disable <email>');
    process.exit(1);
  }

  const db = getDb();

  const admin = db.select().from(admins).where(eq(admins.email, email)).get();
  if (!admin) {
    console.error(`Admin not found: ${email}`);
    process.exit(1);
  }

  db.update(admins).set({ active: 0 }).where(eq(admins.id, admin.id)).run();

  console.log(`Disabled admin: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
