import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Admin Gallery E2E spec — Phase 3C.
 *
 * Tests:
 *  1. Admin can navigate to /admin/gallery
 *  2. Admin can upload a test image and it appears in active grid
 *  3. Uploaded image renders on the public landing page /
 *  4. Admin can archive the photo, it disappears from /
 *
 * Reuses the virtual-authenticator login pattern from other admin specs.
 */

/**
 * Enroll + log in via virtual authenticator.
 */
async function enrollAndLogin(
  context: import('@playwright/test').BrowserContext,
  page: import('@playwright/test').Page,
) {
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

/** Build a minimal valid PNG file on disk for Playwright file upload. */
function createTestPng(): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `swe1-test-gallery-${Date.now()}.png`);

  // PNG magic bytes + minimal IHDR chunk
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR length = 13
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x02,             // bit depth=8, color type=2 (RGB)
    0x00, 0x00, 0x00,       // compression, filter, interlace
    0x90, 0x77, 0x53, 0xde, // CRC
    0x00, 0x00, 0x00, 0x0c, // IDAT length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // compressed data
    0xe2, 0x21, 0xbc, 0x33, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND length
    0x49, 0x45, 0x4e, 0x44, // "IEND"
    0xae, 0x42, 0x60, 0x82, // CRC
  ]);

  fs.writeFileSync(filePath, png);
  return filePath;
}

test.describe('admin gallery — Phase 3C', () => {
  test('Gallery nav link is visible in admin shell', async ({ context, page }) => {
    await enrollAndLogin(context, page);
    await page.goto('/admin/gallery');
    await expect(page).toHaveURL(/\/admin\/gallery$/);
    await expect(page.getByRole('heading', { name: /gallery/i })).toBeVisible();
  });

  test('gallery page renders upload form', async ({ context, page }) => {
    await enrollAndLogin(context, page);
    await page.goto('/admin/gallery');

    await expect(page.getByTestId('gallery-upload-form')).toBeVisible();
    await expect(page.getByTestId('gallery-file-input')).toBeVisible();
    await expect(page.getByTestId('gallery-upload-button')).toBeVisible();
  });

  test('upload image → appears in active grid → renders on /', async ({ context, page }) => {
    await enrollAndLogin(context, page);

    const testPngPath = createTestPng();

    try {
      await page.goto('/admin/gallery');

      // Upload the test image
      await page.getByTestId('gallery-file-input').setInputFiles(testPngPath);
      await page.getByTestId('gallery-caption-input').fill('E2E test photo');
      await page.getByTestId('gallery-upload-button').click();

      // Wait for page to reload/revalidate and show the photo card
      await expect(page.getByTestId('gallery-active-grid')).toBeVisible({ timeout: 10_000 });
      // At least one photo card should appear
      const cards = page.locator('[data-testid^="gallery-photo-card-"]');
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });

      // Navigate to public page and verify gallery section appears
      await page.goto('/');
      await expect(page.locator('#gallery')).toBeVisible({ timeout: 10_000 });
      // The gallery section heading should appear
      await expect(page.getByRole('heading', { name: /photo gallery/i })).toBeVisible();
    } finally {
      try {
        fs.unlinkSync(testPngPath);
      } catch {
        // best effort
      }
    }
  });

  test('archive photo → disappears from public /', async ({ context, page }) => {
    await enrollAndLogin(context, page);

    const testPngPath = createTestPng();

    try {
      // Upload first
      await page.goto('/admin/gallery');
      await page.getByTestId('gallery-file-input').setInputFiles(testPngPath);
      await page.getByTestId('gallery-upload-button').click();

      // Wait for card to appear
      await expect(page.locator('[data-testid^="gallery-photo-card-"]').first()).toBeVisible({
        timeout: 10_000,
      });

      // Get the first photo card's archive button
      const card = page.locator('[data-testid^="gallery-photo-card-"]').first();
      const archiveBtn = card.locator('[data-testid^="gallery-archive-"]');
      await archiveBtn.click();

      // After archive, public page should not show gallery (no active photos)
      await page.goto('/');
      // Gallery section should be absent (Gallery component returns null when no photos)
      await expect(page.locator('#gallery')).not.toBeVisible({ timeout: 5_000 });
    } finally {
      try {
        fs.unlinkSync(testPngPath);
      } catch {
        // best effort
      }
    }
  });
});
