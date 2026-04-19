import { expect, test } from '@playwright/test';

/**
 * Admin auth E2E — drives the founding-admin + login flows end-to-end with
 * Chromium's WebAuthn virtual authenticator over the CDP protocol. The
 * virtual authenticator sits in the browser's WebAuthn stack and answers
 * `navigator.credentials.create() / get()` without any real device.
 *
 * Issue #83 retired ADMIN_EMAILS + BOOTSTRAP_ENABLED. The fresh DB starts
 * with zero admins; /admin/login renders the FoundingAdminForm; the first
 * submit claims the founding slot. See `finishFoundingEnrollment` for where
 * the recovery code is minted and returned.
 */

test('unauthenticated /admin redirects to /admin/login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  // On a fresh DB the admins table is empty → founding-admin heading renders.
  await expect(
    page.getByRole('heading', { name: /create the first admin/i }),
  ).toBeVisible();
});

test.describe('admin auth flow (virtual authenticator)', () => {
  test('enroll then log in with virtual authenticator', async ({ context, page }) => {
    // Turn on the virtual authenticator for the whole context.
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

    // 1. Visit login page — fresh DB, founding flow renders.
    await page.goto('/admin/login');
    await expect(
      page.getByRole('heading', { name: /create the first admin/i }),
    ).toBeVisible();

    // 2. Enter email, submit — triggers startFoundingEnrollment →
    //    startRegistration with virtual authenticator.
    await page.getByTestId('email-input').fill('alex@test.com');
    await page.getByTestId('submit-button').click();

    // 3. Recovery-code modal appears.
    await expect(page.getByTestId('recovery-modal')).toBeVisible({ timeout: 10_000 });
    const code = await page.getByTestId('recovery-code').innerText();
    expect(code).toMatch(/^[A-Z2-9]{12}$/);

    // 4. Can't dismiss until the confirm checkbox is checked.
    await expect(page.getByTestId('dismiss-modal-button')).toBeDisabled();
    await page.getByTestId('confirm-saved-checkbox').check();
    await expect(page.getByTestId('dismiss-modal-button')).toBeEnabled();

    // 5. Dismiss → lands on /admin dashboard.
    await page.getByTestId('dismiss-modal-button').click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId('pending-count')).toHaveText('0');

    // 6. Log out.
    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // 7. Log back in. Now that an admin exists, /admin/login renders the
    //    regular sign-in form (not founding).
    await expect(page.getByRole('heading', { name: /admin sign-in/i })).toBeVisible();
    await page.getByTestId('email-input').fill('alex@test.com');
    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
