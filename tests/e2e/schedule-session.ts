/**
 * Standalone tsx script invoked by tests/e2e/admin-schedule.spec.ts.
 *
 * Creates (if missing) a `session` row for the lone test admin and prints
 * the session token to stdout as JSON. The spec reads the token and injects
 * it as the `swt-session` cookie — letting the E2E test skip the full
 * WebAuthn enrollment ceremony (which is context-scoped to the browser
 * that enrolled it) and focus on the schedule-editor UI.
 *
 * Single-admin install: there's only ever one admin row. We create it on
 * the fly if missing. The auth.js `users` row is keyed on a synthetic
 * `admin-{id}@local` sentinel email — same convention `signIn` uses in
 * production code.
 *
 * Expects DATABASE_URL in env. Never run in production.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { sessions, users } from '@/db/schema/auth-sessions';

async function main(): Promise<void> {
  const db = getDb();
  const nowIso = new Date().toISOString();

  // Ensure the lone admin row exists + is flagged as enrolled.
  let adminRow = db.select().from(admins).limit(1).all()[0];
  if (!adminRow) {
    db.insert(admins)
      .values({
        name: 'Test Admin',
        active: 1,
        enrolledAt: nowIso,
        createdAt: nowIso,
      })
      .run();
    adminRow = db.select().from(admins).limit(1).all()[0]!;
  }
  if (adminRow && !adminRow.enrolledAt) {
    db.update(admins)
      .set({ enrolledAt: nowIso })
      .where(eq(admins.id, adminRow.id))
      .run();
  }

  // Ensure a user row exists for session FK — sentinel email keyed on adminId.
  const sentinelEmail = `admin-${adminRow.id}@local`;
  let user = db.select().from(users).where(eq(users.email, sentinelEmail)).all()[0];
  if (!user) {
    const id = crypto.randomUUID();
    db.insert(users).values({ id, email: sentinelEmail, name: sentinelEmail }).run();
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
