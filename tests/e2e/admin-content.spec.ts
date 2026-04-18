import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * Admin Content CMS — E2E spec.
 *
 * Covers the Contact tab: log in as admin, navigate to /admin/content,
 * update the bio field, save, reload, verify the value persisted.
 *
 * Auth: uses the session-minting approach from admin-schedule.spec.ts to
 * avoid a cross-spec ordering issue where admin-auth.spec.ts enrolls
 * alex@test.com first, leaving this spec unable to re-enroll in a new
 * virtual-authenticator context (the admin is already enrolled).
 *
 * The SEED_FROM_BRIEF env var ensures site_config is populated, but the
 * Contact tab tests write their own values so seed state doesn't matter.
 */

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5827}`;

/**
 * Mint a session token for the test admin and inject it as a cookie.
 * Mirrors the pattern in admin-schedule.spec.ts.
 */
async function loginWithSession(
  context: import('@playwright/test').BrowserContext,
  email = 'alex@test.com',
): Promise<void> {
  const out = execSync('pnpm exec tsx tests/e2e/schedule-session.ts', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
      TEST_ADMIN_EMAIL: email,
    },
  }).toString('utf-8');

  const lines = out.trim().split('\n');
  const parsed = JSON.parse(lines[lines.length - 1]) as {
    token: string;
    expires: string;
  };

  const url = new URL(BASE_URL);
  await context.addCookies([
    {
      name: 'swt-session',
      value: parsed.token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

test.describe('admin content CMS — Contact tab', () => {
  test('navigate to /admin/content and all 4 tabs render', async ({ context, page }) => {
    await loginWithSession(context);

    await page.goto('/admin/content');
    await expect(page).toHaveURL(/\/admin\/content$/);

    // Page heading
    await expect(page.getByRole('heading', { name: /content/i })).toBeVisible();

    // All 4 tab triggers present
    await expect(page.getByRole('tab', { name: /contact/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /sms fallback/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /templates/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /settings/i })).toBeVisible();
  });

  test('edit bio on Contact tab, save, reload, see new value', async ({ context, page }) => {
    await loginWithSession(context);

    await page.goto('/admin/content');

    // The Contact tab is default; confirm we're on it
    await expect(page.getByTestId('contact-form')).toBeVisible();

    // Read the original bio so we can restore it after the test (the shared DB
    // persists across specs, and home.spec checks for the seeded bio text).
    const originalBio = await page.getByTestId('contact-bio').inputValue();

    const newBio = `admin-content test bio — ${Date.now()}`;

    // Clear and fill bio
    await page.getByTestId('contact-bio').fill(newBio);

    // Save
    await page.getByTestId('contact-save').click();

    // Wait for saved indicator
    await expect(page.getByTestId('contact-saved-indicator')).toBeVisible({ timeout: 5_000 });

    // Reload and check value persisted
    await page.reload();
    await expect(page.getByTestId('contact-bio')).toHaveValue(newBio);

    // Restore original bio so subsequent specs (home.spec) see the seeded value.
    await page.getByTestId('contact-bio').fill(originalBio);
    await page.getByTestId('contact-save').click();
    await expect(page.getByTestId('contact-saved-indicator')).toBeVisible({ timeout: 5_000 });
  });

  test('shows validation error for invalid phone', async ({ context, page }) => {
    await loginWithSession(context);
    await page.goto('/admin/content');

    await page.getByTestId('contact-phone').fill('not-a-phone');
    await page.getByTestId('contact-save').click();

    // Should show error, not saved indicator
    await expect(page.getByTestId('contact-saved-indicator')).not.toBeVisible({ timeout: 3_000 });
    // Error message visible (scoped to the destructive/error style to avoid
    // matching the label which also mentions E.164)
    await expect(page.getByText('Phone must be in E.164 format')).toBeVisible();
  });
});
