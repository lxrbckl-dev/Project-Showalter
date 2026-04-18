/**
 * Test-only helper invoked from tests/e2e/admin-invites.spec.ts.
 *
 * Probes the test DB for the most recent non-terminal admin_invites row and
 * prints `{"hasPending": boolean}` to stdout. Lives as a dedicated file (not
 * an inline `tsx -e ...` string) because backticks inside the inline form
 * were being interpreted by the shell as command substitution and the
 * surrounding tests were failing with esbuild parse errors (issue #84 QA).
 *
 * DATABASE_URL env contract matches the other e2e helpers — defaults to
 * `file:./dev.db` if unset.
 */

import Database from 'better-sqlite3';

function main(): void {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  const path = raw.replace(/^file:/, '');
  const db = new Database(path);
  try {
    const row = db
      .prepare(
        "SELECT token FROM admin_invites WHERE used_at IS NULL AND revoked_at IS NULL ORDER BY id DESC LIMIT 1",
      )
      .get();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ hasPending: !!row }));
  } finally {
    db.close();
  }
}

main();
