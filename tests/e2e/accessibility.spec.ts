import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility audit — Phase 12 polish.
 *
 * Runs axe-core against the three main public-facing pages.
 * Critical violations fail the test; minor violations are logged as warnings.
 *
 * Viewport smoke-tests: each page is verified at 375px (mobile),
 * 768px (tablet), and 1440px (desktop).
 */

const PUBLIC_PAGES = ['/', '/book', '/admin/login'] as const;

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

// ---------------------------------------------------------------------------
// Axe accessibility audits
// ---------------------------------------------------------------------------

for (const route of PUBLIC_PAGES) {
  test(`a11y: no critical violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    // Wait for the page to be fully rendered
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    );
    const serious = results.violations.filter(
      (v) => v.impact === 'serious',
    );
    const minor = results.violations.filter(
      (v) => v.impact !== 'critical' && v.impact !== 'serious',
    );

    if (minor.length > 0) {
      console.warn(
        `[a11y] ${route} — ${minor.length} minor/moderate violation(s) (not failing):`,
        minor.map((v) => `${v.id}: ${v.description}`),
      );
    }
    if (serious.length > 0) {
      console.warn(
        `[a11y] ${route} — ${serious.length} serious violation(s) (not failing):`,
        serious.map((v) => `${v.id}: ${v.description}`),
      );
    }

    expect(
      critical,
      `Critical a11y violations on ${route}:\n${critical
        .map((v) => `  [${v.id}] ${v.description}\n    Nodes: ${v.nodes.map((n) => n.html).join(', ')}`)
        .join('\n')}`,
    ).toHaveLength(0);
  });
}

// ---------------------------------------------------------------------------
// Viewport smoke-tests — verify pages render at 375/768/1440
// ---------------------------------------------------------------------------

for (const vp of VIEWPORTS) {
  test(`viewport smoke: / renders at ${vp.width}px (${vp.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Hero heading is visible at every breakpoint
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(vp.width + 20); // 20px tolerance for scrollbar
  });
}

for (const vp of VIEWPORTS) {
  test(`viewport smoke: /book renders at ${vp.width}px (${vp.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/book');
    await page.waitForLoadState('networkidle');

    // Page heading is visible
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
}

for (const vp of VIEWPORTS) {
  test(`viewport smoke: /admin/login renders at ${vp.width}px (${vp.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');

    // Login heading is visible
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });
}
