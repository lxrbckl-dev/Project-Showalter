import { expect, test } from '@playwright/test';

/**
 * Admin Content CMS — E2E spec.
 *
 * Covers the Contact tab: log in as admin, navigate to /admin/content,
 * update the bio field, save, reload, verify the value persisted.
 *
 * Reuses the global-setup virtual-authenticator pattern from admin-auth.spec.ts:
 *   - global-setup wipes dev.db + runs migrations + reconcile on every run
 *   - ADMIN_EMAILS=alex@test.com, BOOTSTRAP_ENABLED=true (from playwright.config.ts)
 *
 * The SEED_FROM_BRIEF env var is NOT set in the playwright.config.ts webServer,
 * so the site_config row exists (created by migration) but contact fields are
 * NULL. The spec writes a bio, saves, reloads, and checks the new value.
 */

/**
 * Enroll + log in via virtual authenticator and return to the admin shell.
 * Extracted so individual tests can call it without repeating CDP boilerplate.
 */
async function enrollAndLogin(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page) {
  const client = await context.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto('/admin/login');
  await page.getByTestId('email-input').fill('alex@test.com');
  await page.getByTestId('submit-button').click();

  // Recovery-code modal
  await expect(page.getByTestId('recovery-modal')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('confirm-saved-checkbox').check();
  await page.getByTestId('dismiss-modal-button').click();

  // Should be on dashboard
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('admin content CMS — Contact tab', () => {
  test('navigate to /admin/content and all 4 tabs render', async ({ context, page }) => {
    await enrollAndLogin(context, page);

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
    await enrollAndLogin(context, page);

    await page.goto('/admin/content');

    // The Contact tab is default; confirm we're on it
    await expect(page.getByTestId('contact-form')).toBeVisible();

    const newBio = `SWE-1 test bio — ${Date.now()}`;

    // Clear and fill bio
    await page.getByTestId('contact-bio').fill(newBio);

    // Save
    await page.getByTestId('contact-save').click();

    // Wait for saved indicator
    await expect(page.getByTestId('contact-saved-indicator')).toBeVisible({ timeout: 5_000 });

    // Reload and check value persisted
    await page.reload();
    await expect(page.getByTestId('contact-bio')).toHaveValue(newBio);
  });

  test('shows validation error for invalid phone', async ({ context, page }) => {
    await enrollAndLogin(context, page);
    await page.goto('/admin/content');

    await page.getByTestId('contact-phone').fill('not-a-phone');
    await page.getByTestId('contact-save').click();

    // Should show error, not saved indicator
    await expect(page.getByTestId('contact-saved-indicator')).not.toBeVisible({ timeout: 3_000 });
    // Error text visible somewhere on the form
    await expect(page.locator('text=E.164')).toBeVisible();
  });
});
