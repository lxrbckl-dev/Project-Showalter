import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Playwright global setup — wipes `dev.db`, then runs migrations + reconciles
 * the admin list from ADMIN_EMAILS via a tsx subprocess so the auth E2E
 * always begins with a clean slate: no pre-existing admins, no prior
 * enrollments, but the target admin row exists in pending state.
 *
 * Why a subprocess instead of inline imports:
 *   The Playwright runner loads this file with its own TS loader, which does
 *   not resolve our `@/*` path aliases or handle the better-sqlite3 native
 *   module cleanly. `tsx` (already in devDeps) handles both.
 *
 * Why here instead of relying on instrumentation.ts:
 *   next.config.ts sets `output: 'standalone'`; the webServer command
 *   (`next start`) boots but migration-at-boot through instrumentation.ts
 *   doesn't run reliably in standalone mode. Running the same steps
 *   pre-server keeps the DB definitively ready.
 *
 * Without the wipe, a second run would find `alex@test.com` already enrolled
 * from the previous run and fall into the login branch (which fails because
 * the test recreates the virtual authenticator from scratch).
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

  // Run migrations + reconcile via a tsx subprocess so the `@/*` path aliases
  // and better-sqlite3 native module resolve the same way they do at runtime.
  execSync('pnpm exec tsx tests/e2e/seed-db.ts', {
    cwd,
    env,
    stdio: 'inherit',
  });
}
