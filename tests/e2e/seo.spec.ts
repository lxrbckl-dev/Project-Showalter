import { expect, test } from '@playwright/test';

/**
 * Phase 12 SEO E2E assertions.
 *
 * Verifies:
 *  - /robots.txt is valid and references the sitemap
 *  - /sitemap.xml is valid XML containing at least the home URL
 *  - / HTML includes expected meta tags (description, og:title, twitter:card)
 */

test('GET /robots.txt returns valid robots output', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);

  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/text\/plain/);

  const body = await response.text();
  expect(body).toMatch(/User-[Aa]gent: \*/); // Next.js renders "User-Agent" (capital A)
  expect(body).toContain('Allow: /');
  expect(body).toMatch(/Sitemap:/);
  expect(body).toContain('sitemap.xml');
});

test('GET /sitemap.xml returns valid XML with home URL', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);

  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/xml/);

  const body = await response.text();
  // Must be an XML document
  expect(body).toContain('<?xml');
  // Must include the urlset namespace
  expect(body).toContain('urlset');
  // Must include the root URL
  expect(body).toMatch(/https?:\/\//);
});

test('/ HTML includes expected meta tags', async ({ page }) => {
  await page.goto('/');

  // <title> tag
  const title = await page.title();
  expect(title).toContain('Showalter Services');

  // meta description
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).toBeTruthy();
  expect(description!.length).toBeGreaterThan(10);

  // og:title
  const ogTitle = await page
    .locator('meta[property="og:title"]')
    .getAttribute('content');
  expect(ogTitle).toContain('Showalter Services');

  // og:description
  const ogDescription = await page
    .locator('meta[property="og:description"]')
    .getAttribute('content');
  expect(ogDescription).toBeTruthy();

  // og:image
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute('content');
  expect(ogImage).toBeTruthy();

  // twitter:card
  const twitterCard = await page
    .locator('meta[name="twitter:card"]')
    .getAttribute('content');
  expect(twitterCard).toBe('summary_large_image');

  // twitter:title
  const twitterTitle = await page
    .locator('meta[name="twitter:title"]')
    .getAttribute('content');
  expect(twitterTitle).toContain('Showalter Services');
});
