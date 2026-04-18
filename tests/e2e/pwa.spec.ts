import { expect, test } from '@playwright/test';

test('GET /manifest.webmanifest returns valid JSON with required PWA fields', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);

  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/json/);

  const manifest = await response.json();

  expect(manifest.name).toBe('Showalter Services');
  expect(manifest.short_name).toBe('Showalter');
  expect(manifest.description).toBe('Lawn care booking');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.background_color).toBe('#000000');
  expect(manifest.theme_color).toBe('#0F3D2E');
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
});

test('GET /icon serves a favicon image', async ({ request }) => {
  const response = await request.get('/icon');
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/image/);
});

test('GET /apple-icon serves an Apple touch icon image', async ({ request }) => {
  const response = await request.get('/apple-icon');
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/image/);
});
