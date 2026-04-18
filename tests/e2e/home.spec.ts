import { expect, test } from '@playwright/test';

/**
 * Public landing page E2E tests.
 *
 * These tests assume a running dev/prod server with SEED_FROM_BRIEF=true
 * applied on a fresh DB, so all sections are populated.
 *
 * The old Phase 0 test for "Phase 0 skeleton" text is removed — that
 * copy has been replaced by the real landing page.
 */

test('home page hero heading renders', async ({ page }) => {
  await page.goto('/');
  // The hero renders the "Showalter Services" label
  await expect(page.getByText('Showalter Services').first()).toBeVisible();
});

test('home page hero has "Request service" CTA linking to #request', async ({ page }) => {
  await page.goto('/');
  const ctaLink = page.getByRole('link', { name: /request service/i }).first();
  await expect(ctaLink).toBeVisible();
  const href = await ctaLink.getAttribute('href');
  expect(href).toBe('#request');
});

test('home page services section renders when seeded', async ({ page }) => {
  await page.goto('/');
  // Services heading
  await expect(page.getByRole('heading', { name: /services/i })).toBeVisible();
  // At least one seeded service
  await expect(page.getByText('Mowing')).toBeVisible();
  await expect(page.getByText('Trash Can Cleaning')).toBeVisible();
  // Snow removal should show "Contact for pricing"
  await expect(page.getByText('Contact for pricing')).toBeVisible();
});

test('home page contact section shows phone number', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('(913) 309-7340')).toBeVisible();
});

test('home page footer has SMS link with sms: href', async ({ page }) => {
  await page.goto('/');
  const smsLink = page.getByRole('link', { name: /text sawyer directly/i });
  await expect(smsLink).toBeVisible();
  const href = await smsLink.getAttribute('href');
  expect(href).toMatch(/^sms:/);
  // Should encode a phone number
  expect(href).toContain('19133097340');
});

test('home page #request anchor placeholder is present', async ({ page }) => {
  await page.goto('/');
  // The "Request a Service" section heading
  await expect(page.getByRole('heading', { name: /request a service/i })).toBeVisible();
});

test('home page about section shows bio when seeded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /about sawyer/i })).toBeVisible();
  await expect(page.getByText(/15 year old entrepreneur/i)).toBeVisible();
});
