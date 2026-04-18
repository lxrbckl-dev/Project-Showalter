/**
 * Test-only helper invoked from tests/e2e/admin-invites.spec.ts.
 *
 * Inserts a pre-expired `admin_invites` row attributed to the first admin in
 * the DB and prints `{"token": "<uuid>"}` on success (or `{"token": null}` if
 * there is no founder admin to attribute against).
 *
 * Lives as a dedicated file rather than an inline `tsx -e ...` string because
 * inline backticks inside `execSync` were being eaten by the shell as command
 * substitution, tripping an esbuild parse error before the helper could run
 * (issue #84 QA).
 *
 * DATABASE_URL env contract matches the other e2e helpers — defaults to
 * `file:./dev.db` if unset.
 */

import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

type FounderRow = { id: number } | undefined;

function main(): void {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  const path = raw.replace(/^file:/, '');
  const db = new Database(path);
  try {
    const founder = db
      .prepare('SELECT id FROM admins ORDER BY id ASC LIMIT 1')
      .get() as FounderRow;
    if (!founder) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ token: null }));
      return;
    }

    const token = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO admin_invites
        (token, invited_email, created_by_admin_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(token, 'expired@test.com', founder.id, '2020-01-01T00:00:00Z', now);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ token }));
  } finally {
    db.close();
  }
}

main();
