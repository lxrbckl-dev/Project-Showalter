import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 5827);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
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
        command: 'pnpm start',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          NODE_ENV: 'production',
          PORT: String(PORT),
          DATABASE_URL: 'file:./dev.db',
          // Auth E2E defaults — global-setup wipes dev.db before the server
          // boots, and boot()'s reconcileAdmins reseeds the admin from
          // ADMIN_EMAILS, so the flow always starts at pending/unenrolled.
          BOOTSTRAP_ENABLED: process.env.BOOTSTRAP_ENABLED ?? 'true',
          ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'alex@test.com',
          AUTH_SECRET:
            process.env.AUTH_SECRET ?? 'dev-only-auth-secret-change-in-production',
          BASE_URL: process.env.BASE_URL ?? BASE_URL,
        },
      },
});
