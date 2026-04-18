import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Playwright global setup — wipes `dev.db` and re-seeds (migrate + reconcile
 * ADMIN_EMAILS) so every E2E run starts with the admin in a clean
 * pending/unenrolled state.
 *
 * Why wipe + re-seed here and not just trust the server's own boot path:
 *   - `src/instrumentation.ts` → `src/server/boot.ts` runs migrations and
 *     reconciliation at server startup, and that IS the production boot
 *     path. For a fresh server this is sufficient.
 *   - However, Playwright starts `webServer` *before* `globalSetup`. That
 *     means when globalSetup runs, boot() has already populated the DB. If
 *     we simply wiped, the route bundles that open sqlite connections
 *     lazily (first server action request) would observe an empty DB and
 *     fail with "no such table" errors until the next server restart.
 *   - So we wipe, *then* re-run the same migrate + reconcile sequence via a
 *     `tsx` subprocess. The route chunks that haven't opened sqlite yet
 *     will pick up the freshly-seeded file on first access.
 *
 * Without the wipe, a second run would find `alex@test.com` already enrolled
 * from the previous run's webauthn ceremony and fall into the login branch
 * (which fails because the test recreates the virtual authenticator from
 * scratch).
 *
 * Why a tsx subprocess for the re-seed: Playwright's runner loads this file
 * with its own TS loader, which doesn't resolve the `@/*` path aliases or
 * handle better-sqlite3's native module cleanly. `tsx` (already in devDeps)
 * handles both — same approach `pnpm db:migrate` already uses.
 */
export default async function globalSetup(): Promise<void> {
  const cwd = process.cwd();

  for (const name of ['dev.db', 'dev.db-journal', 'dev.db-shm', 'dev.db-wal']) {
    try {
      rmSync(join(cwd, name), { force: true });
    } catch {
      // best-effort; missing files are fine
    }
  }

  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
    ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'alex@test.com',
  };

  execSync('pnpm exec tsx tests/e2e/seed-db.ts', {
    cwd,
    env,
    stdio: 'inherit',
  });
}
