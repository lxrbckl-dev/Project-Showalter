import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 5827);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

// Absolute DB path: the standalone server does `process.chdir(__dirname)`
// into `.next/standalone/`, so a relative `./dev.db` would diverge from the
// repo-root `./dev.db` that test helpers (e.g. `tests/e2e/schedule-session.ts`)
// reach via `tsx` subprocesses. Pin both to the same file at the repo root.
const DB_PATH = resolve(process.cwd(), 'dev.db');
const DATABASE_URL = `file:${DB_PATH}`;

// Local uploads root for E2E runs — /data/uploads is the production path but
// requires root to create. Use a writable path under the repo for local runs.
const UPLOADS_ROOT = process.env.UPLOADS_ROOT ?? resolve(process.cwd(), '.e2e-uploads');

// Ensure SEED_FROM_BRIEF is set in the Playwright runner process before
// globalSetup runs. globalSetup passes `...process.env` to the tsx subprocess
// (seed-db.ts), and seedFromBrief() guards on this env var internally. Without
// setting it here, the subprocess inherits an unset variable and skips seeding.
process.env.SEED_FROM_BRIEF ??= 'true';

/**
 * The webServer runs the real production entry point (`node
 * .next/standalone/server.js`) so the instrumentation hook fires and the DB
 * boot path (migrations + admin reconciliation + optional seed) runs exactly
 * as it does in production. `pnpm start` is not used — it's incompatible
 * with `output: 'standalone'` in Next 15 and would bypass standalone's
 * module resolution for the instrumentation bundle.
 *
 * The wrapper command produces the standalone output and copies the bits
 * the standalone dir doesn't include by default — `drizzle/` migrations,
 * `public/` assets, and `.next/static/`. Docker's `Dockerfile` does the
 * equivalent copies at image build time.
 *
 * The leading `rm -f dev.db*` is the per-run DB wipe. It lives here — not
 * in `globalSetup` — because Playwright starts `webServer` *before*
 * `globalSetup`, so a wipe in globalSetup lands after boot() has already
 * populated the DB, which clobbers the freshly-migrated schema. Wiping
 * before `pnpm build` guarantees boot() writes to a clean slate.
 */
const SERVER_CMD = [
  'rm -f dev.db dev.db-journal dev.db-shm dev.db-wal',
  'pnpm build',
  'cp -R drizzle .next/standalone/drizzle',
  'cp -R public .next/standalone/public',
  'cp -R .next/static .next/standalone/.next/static',
  'node .next/standalone/server.js',
].join(' && ');

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Tests share a single webServer + dev.db; cross-file enrollment mutates
  // the same admin row, so run one worker at a time to avoid races. Within
  // a file, tests still execute in order (fullyParallel controls cross-test
  // parallelism inside a single file — we leave it off-by-default).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: SERVER_CMD,
        url: `${BASE_URL}/api/health`,
        // Always start a fresh server so the prebuild + standalone copies
        // run and boot()'s migration+reconcile+seed sequence executes
        // against a freshly-wiped dev.db (see tests/e2e/global-setup.ts).
        reuseExistingServer: false,
        // Build + copy + boot takes ~30-60s on a cold cache.
        timeout: 180_000,
        // Pipe stdout so boot() migration/reconcile logs surface in
        // Playwright output when debugging flaky server startup.
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          NODE_ENV: 'production',
          PORT: String(PORT),
          DATABASE_URL,
          // Auth E2E defaults — global-setup wipes dev.db before the server
          // boots, and boot()'s reconcileAdmins reseeds the admin from
          // ADMIN_EMAILS, so the flow always starts at pending/unenrolled.
          BOOTSTRAP_ENABLED: process.env.BOOTSTRAP_ENABLED ?? 'true',
          ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'alex@test.com',
          AUTH_SECRET:
            process.env.AUTH_SECRET ?? 'dev-only-auth-secret-change-in-production',
          BASE_URL: process.env.BASE_URL ?? BASE_URL,
          // Seed Sawyer's personal data + services so the server has seeded
          // content from boot. globalSetup will also re-seed after its wipe.
          SEED_FROM_BRIEF: process.env.SEED_FROM_BRIEF ?? 'true',
          // Upload root for file storage. Production uses /data/uploads (Docker
          // bind-mount); for local E2E runs we use a writable path under the repo.
          UPLOADS_ROOT,
          // Enable test-only helper endpoints (e.g. cache-flush routes) used by
          // E2E specs to reset server-side state between tests. Never set this in
          // a real production deployment.
          ALLOW_TEST_ENDPOINTS: 'true',
        },
      },
});
