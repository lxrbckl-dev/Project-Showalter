/**
 * Standalone tsx script invoked by tests/e2e/admin-schedule.spec.ts.
 *
 * Creates (if missing) a `session` row for the test admin and prints the
 * session token to stdout as JSON. The spec reads the token and injects
 * it as the `swt-session` cookie — letting the E2E test skip the full
 * WebAuthn enrollment ceremony (which is context-scoped to the browser
 * that enrolled it) and focus on the schedule-editor UI.
 *
 * Keeping auth-bypass logic in a dedicated test-only script — rather than
 * adding test-mode code paths to production auth — keeps the production
 * auth surface unchanged.
 *
 * Expects DATABASE_URL in env. Creates the admin row on the fly
 * if it does not yet exist — since #83 admins are no longer pre-seeded at
 * boot, so this helper is the source of truth for specs that need a
 * session without driving the full invite or founding flow.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { sessions, users } from '@/db/schema/auth-sessions';

async function main(): Promise<void> {
  const rawEmail = (process.env.TEST_ADMIN_EMAIL ?? 'alex@test.com').toLowerCase();
  const db = getDb();

  // Ensure the admin row exists + is flagged as enrolled so the rest of
  // the app treats the session as a real logged-in admin. Since #83 admins
  // are no longer pre-seeded at boot — create the row on the fly if missing.
  const nowIso = new Date().toISOString();
  let adminRow = db
    .select()
    .from(admins)
    .where(eq(admins.email, rawEmail))
    .all()[0];
  if (!adminRow) {
    db.insert(admins)
      .values({
        email: rawEmail,
        active: 1,
        enrolledAt: nowIso,
        createdAt: nowIso,
      })
      .run();
    adminRow = db.select().from(admins).where(eq(admins.email, rawEmail)).all()[0];
  }
  if (adminRow && !adminRow.enrolledAt) {
    db.update(admins)
      .set({ enrolledAt: nowIso })
      .where(eq(admins.id, adminRow.id))
      .run();
  }

  // Ensure a user row exists for session FK.
  let user = db.select().from(users).where(eq(users.email, rawEmail)).all()[0];
  if (!user) {
    const id = crypto.randomUUID();
    db.insert(users).values({ id, email: rawEmail, name: rawEmail }).run();
    user = db.select().from(users).where(eq(users.id, id)).all()[0]!;
  }

  // Create a fresh session row + print the token.
  const token = randomBytes(48).toString('base64url');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  db.insert(sessions)
    .values({ sessionToken: token, userId: user.id, expires })
    .run();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ token, expires: expires.toISOString() }));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('schedule-session failed:', err);
  process.exit(1);
});
