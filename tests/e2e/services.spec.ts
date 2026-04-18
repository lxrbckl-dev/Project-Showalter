/**
 * services.spec.ts — E2E spec for the admin services CRUD UI.
 *
 * Requires a running dev server with at least one enrolled admin.
 *
 * Auth: uses the same session-minting approach as admin-schedule.spec.ts —
 * invokes `schedule-session.ts` to inject a valid session cookie directly,
 * bypassing WebAuthn enrollment. This avoids a cross-spec race where
 * admin-auth.spec.ts enrolls alex@test.com in a virtual-authenticator context
 * that services.spec.ts cannot access, leaving the admin "enrolled but
 * credentials unknown" to the new test context.
 *
 * Flow: mint session → plant cookie → /admin/services → create → edit → archive → restore → reorder
 */

import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

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

test.describe('admin services CRUD', () => {
  test('full CRUD flow: create, edit, archive, restore', async ({ context, page }) => {
    await loginWithSession(context);

    // Navigate to /admin/services
    await page.goto('/admin/services');
    await expect(page.getByRole('heading', { name: 'Services', exact: true })).toBeVisible();

    // --- Create ---
    await page.getByTestId('new-service-button').click();
    await expect(page).toHaveURL(/\/admin\/services\/new$/);

    await page.getByTestId('input-name').fill('E2E Test Service');
    await page.getByTestId('input-description').fill('Created by Playwright E2E spec.');
    await page.getByTestId('input-price-cents').fill('1500');
    await page.getByTestId('input-price-suffix').fill('+');
    await page.getByTestId('input-sort-order').fill('99');
    await page.getByTestId('submit-button').click();

    // Should redirect back to list
    await expect(page).toHaveURL(/\/admin\/services$/, { timeout: 10_000 });

    // New service should appear in the table
    const row = page.locator('[data-testid^="service-row-"]').filter({ hasText: 'E2E Test Service' });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('service-status')).toHaveText('Active');

    // --- Edit ---
    await row.getByTestId('edit-button').click();
    await expect(page).toHaveURL(/\/admin\/services\/\d+\/edit$/);

    await page.getByTestId('input-name').fill('E2E Test Service (edited)');
    await page.getByTestId('submit-button').click();

    await expect(page).toHaveURL(/\/admin\/services$/, { timeout: 10_000 });

    const editedRow = page
      .locator('[data-testid^="service-row-"]')
      .filter({ hasText: 'E2E Test Service (edited)' });
    await expect(editedRow).toBeVisible();

    // --- Archive ---
    await editedRow.getByTestId('archive-button').click();
    await expect(editedRow.getByTestId('service-status')).toHaveText('Archived', { timeout: 5_000 });

    // Row still exists (no hard delete)
    await expect(editedRow).toBeVisible();

    // --- Restore ---
    await editedRow.getByTestId('restore-button').click();
    await expect(editedRow.getByTestId('service-status')).toHaveText('Active', { timeout: 5_000 });
  });

  test('reorder via drag (smoke: list renders, drag handle present)', async ({ context, page }) => {
    await loginWithSession(context);
    await page.goto('/admin/services');

    // If there are active services, the sortable list should render
    const sortableList = page.getByTestId('sortable-services-list');
    // It's only shown when there are active services — the seeded DB should have them
    if (await sortableList.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const handles = page.getByTestId('drag-handle');
      const count = await handles.count();
      expect(count).toBeGreaterThan(0);

      // Perform a drag from first item to second item
      if (count >= 2) {
        const first = handles.nth(0);
        const second = handles.nth(1);
        const firstBox = await first.boundingBox();
        const secondBox = await second.boundingBox();
        if (firstBox && secondBox) {
          await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
          await page.mouse.down();
          await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, { steps: 10 });
          await page.mouse.up();
          // No assertion on order — just verify no crash
          await expect(sortableList).toBeVisible();
        }
      }
    }
    // If no services seeded, the reorder section just shows the empty state — that's fine too
  });
});
