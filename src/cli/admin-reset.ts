/**
 * admin:reset — clear the lone admin row and all attached credentials.
 *
 * Single-admin install: no args needed. Wipes the admin, all of its
 * credentials, and all recovery codes, returning the deploy to the
 * "founding admin" state where /admin/login renders the enrollment form.
 *
 * Usage: pnpm admin:reset
 */

import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { credentials } from '@/db/schema/credentials';
import { recoveryCodes } from '@/db/schema/recovery-codes';

async function main(): Promise<void> {
  const db = getDb();
  db.delete(credentials).run();
  db.delete(recoveryCodes).run();
  db.delete(admins).run();
  console.log('Admin reset complete — visit /admin/login to enroll a new founding admin.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
