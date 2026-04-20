/**
 * Test-only helper invoked by tests/e2e/admin-devices.spec.ts.
 *
 * Single-admin install: there's only ever one admin row. Resetting just
 * means wiping admins / credentials / recovery_codes / sessions / users so
 * the next spec boots into the founding form with a clean slate.
 *
 * Required because admin-devices.spec.ts runs after admin-auth.spec.ts in
 * the shared dev.db and the first spec's virtual authenticator is gone by
 * the time the second spec opens its own context.
 *
 * Never run in production.
 */

import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { credentials } from '@/db/schema/credentials';
import { recoveryCodes } from '@/db/schema/recovery-codes';
import { sessions, users } from '@/db/schema/auth-sessions';

async function main(): Promise<void> {
  const db = getDb();

  // Drop in dependency order — credentials/recovery_codes FK admins.id;
  // sessions FK users.id. Wiping sessions+users last is fine since users is
  // referenced by sessions only.
  db.delete(credentials).run();
  db.delete(recoveryCodes).run();
  db.delete(sessions).run();
  db.delete(users).run();
  db.delete(admins).run();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true }));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('reset-admin-for-devices failed:', err);
  process.exit(1);
});
