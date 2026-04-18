import { expect, test } from '@playwright/test';

test('home page renders the Phase 0 heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Showalter Services' })).toBeVisible();
  await expect(page.getByText(/Phase 0 skeleton/i)).toBeVisible();
});
