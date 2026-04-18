import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * Admin multi-device passkey management (issue #77).
 *
 * Flow:
 *   1. Enroll a first passkey with virtual authenticator A (re-using the
 *      bootstrap path — just like admin-auth.spec.ts).
 *   2. Navigate to /admin/settings/devices; verify the page shows exactly
 *      one device with the "This device" badge.
 *   3. Add a second virtual authenticator B, click "Add another device",
 *      and verify the devices list grows to 2 rows.
 *   4. Verify the "Remove" button is NOT present on the current-device row
 *      (UX safeguard) but IS present on the newly added second row.
 *   5. Remove the second device via the confirm dialog; verify the list
 *      collapses back to 1 row with no remove button.
 *
 * We use two separate virtual authenticators (each with its own `transport`)
 * so the browser can distinguish them. The second authenticator has
 * `transport: 'usb'` — the first one uses `internal`, matching the
 * "platform authenticator" the bootstrap flow expects.
 */

/**
 * Wipe the test admin back to pending-enrollment state. Necessary because
 * admin-auth.spec.ts ran first on the shared dev.db and already enrolled
 * `alex@test.com`; the virtual authenticator from that spec's context is
 * gone by the time we open our own.
 */
function resetAdmin(): void {
  execSync('pnpm exec tsx tests/e2e/reset-admin-for-devices.ts', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
      ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'alex@test.com',
    },
  });
}

test.describe('admin devices page', () => {
  test.beforeAll(() => {
    resetAdmin();
  });

  test('add-second-device + remove flow with two virtual authenticators', async ({
    context,
    page,
  }) => {
    const client = await context.newCDPSession(page);
    await client.send('WebAuthn.enable');

    // Authenticator A — platform / internal. Used for the initial enroll
    // and therefore is the "This device" passkey.
    const authA = await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    // Bootstrap-enroll authenticator A.
    await page.goto('/admin/login');
    await page.getByTestId('email-input').fill('alex@test.com');
    await page.getByTestId('submit-button').click();
    await expect(page.getByTestId('recovery-modal')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('confirm-saved-checkbox').check();
    await page.getByTestId('dismiss-modal-button').click();
    await expect(page).toHaveURL(/\/admin$/);

    // Visit devices page — one device, and it's this one.
    await page.goto('/admin/settings/devices');
    await expect(page.getByRole('heading', { name: /devices/i })).toBeVisible();
    await expect(page.getByTestId('device-row')).toHaveCount(1);
    await expect(page.getByTestId('this-device-badge')).toBeVisible();
    // Remove button absent when there's only one device.
    await expect(page.getByTestId('remove-button')).toHaveCount(0);

    // Add authenticator B — distinct from A so addVirtualAuthenticator
    // produces a second credential set.
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    // Auto-accept the label prompt with a fixed string.
    page.once('dialog', (dialog) => {
      if (dialog.type() === 'prompt') {
        void dialog.accept('My USB Key');
      } else {
        void dialog.dismiss();
      }
    });

    await page.getByTestId('add-device-button').click();

    // Wait for the list to reflect the new device.
    await expect(page.getByTestId('device-row')).toHaveCount(2, { timeout: 10_000 });

    // The current-device row still has no remove button.
    const currentRow = page.locator('[data-testid="device-row"][data-this-device="true"]');
    await expect(currentRow).toHaveCount(1);
    await expect(currentRow.getByTestId('remove-button')).toHaveCount(0);

    // The new row HAS a remove button.
    const otherRow = page.locator('[data-testid="device-row"][data-this-device="false"]');
    await expect(otherRow).toHaveCount(1);
    const removeBtn = otherRow.getByTestId('remove-button');
    await expect(removeBtn).toBeVisible();

    // Remove the second device — auto-confirm the confirm() dialog.
    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await removeBtn.click();

    // Back to one device + no remove button.
    await expect(page.getByTestId('device-row')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId('remove-button')).toHaveCount(0);
    await expect(page.getByTestId('this-device-badge')).toBeVisible();

    // Silence unused-var lint; we captured authA's id but don't need to act on it.
    void authA;
  });
});
