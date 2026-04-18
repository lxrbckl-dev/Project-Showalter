/**
 * Test-only helper invoked by tests/e2e/admin-devices.spec.ts.
 *
 * Resets the test admin back to pending-enrollment state by deleting every
 * row in `credentials`, `session`, and `user` for them, and setting
 * `enrolled_at = NULL`. Required because admin-devices.spec.ts runs after
 * admin-auth.spec.ts in the shared dev.db + the first spec already enrolled
 * `alex@test.com`. The virtual authenticator from the first spec is gone
 * when the second spec opens its own context, so we can't log in as alex
 * using the existing credentials — we need to re-enroll with a new virtual
 * authenticator.
 *
 * Never run in production. Relies on the same DATABASE_URL env contract as
 * schedule-session.ts and seed-db.ts.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { credentials } from '@/db/schema/credentials';
import { recoveryCodes } from '@/db/schema/recovery-codes';
import { sessions, users } from '@/db/schema/auth-sessions';

async function main(): Promise<void> {
  const email = (process.env.TEST_ADMIN_EMAIL ?? 'alex@test.com').toLowerCase();
  const db = getDb();

  const adminRow = db.select().from(admins).where(eq(admins.email, email)).all()[0];
  if (!adminRow) {
    // Since #83 admins are no longer pre-seeded at boot — if the first spec
    // hasn't yet run the founding flow to create one, there's nothing to
    // reset. That's a valid state for the start of a run; just no-op.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, email, note: 'no admin row yet' }));
    return;
  }

  // Drop credentials + recovery codes for this admin.
  db.delete(credentials).where(eq(credentials.adminId, adminRow.id)).run();
  db.delete(recoveryCodes).where(eq(recoveryCodes.adminId, adminRow.id)).run();

  // Drop every session row for the associated user (sessions cascade on user).
  const userRow = db.select().from(users).where(eq(users.email, email)).all()[0];
  if (userRow) {
    db.delete(sessions).where(eq(sessions.userId, userRow.id)).run();
  }

  // Delete the admin row entirely — the founding flow requires the admins
  // table to be empty so the next spec boots into the founding form, not
  // a pending-enrollment login. (Admins/credentials for this email will be
  // re-created on enrollment.)
  db.delete(admins).where(eq(admins.id, adminRow.id)).run();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, email }));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('reset-admin-for-devices failed:', err);
  process.exit(1);
});
