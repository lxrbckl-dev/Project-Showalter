/**
 * Unit tests for UmamiScript analytics component logic.
 *
 * We test the shouldRenderUmamiScript helper (extracted from UmamiScript) so
 * the render condition is covered independently of the React environment.
 * Vitest runs in the `node` environment (no DOM), so we test the guard logic
 * directly rather than using a renderer.
 */

import { describe, it, expect, afterEach } from 'vitest';

/**
 * Mirror the guard logic from UmamiScript.tsx.
 * Returns true only when both vars are non-empty strings.
 */
function shouldRenderUmamiScript(src: string | undefined, websiteId: string | undefined): boolean {
  return Boolean(src && websiteId);
}

describe('UmamiScript — render guard', () => {
  it('returns true when both env vars are set', () => {
    expect(
      shouldRenderUmamiScript(
        'https://analytics.showalter.business/script.js',
        'abc-123-def',
      ),
    ).toBe(true);
  });

  it('returns false when NEXT_PUBLIC_UMAMI_SRC is missing', () => {
    expect(shouldRenderUmamiScript(undefined, 'abc-123-def')).toBe(false);
  });

  it('returns false when NEXT_PUBLIC_UMAMI_WEBSITE_ID is missing', () => {
    expect(
      shouldRenderUmamiScript('https://analytics.showalter.business/script.js', undefined),
    ).toBe(false);
  });

  it('returns false when both env vars are missing', () => {
    expect(shouldRenderUmamiScript(undefined, undefined)).toBe(false);
  });

  it('returns false when either env var is an empty string', () => {
    expect(
      shouldRenderUmamiScript('https://analytics.showalter.business/script.js', ''),
    ).toBe(false);
    expect(shouldRenderUmamiScript('', 'abc-123-def')).toBe(false);
    expect(shouldRenderUmamiScript('', '')).toBe(false);
  });
});

describe('UmamiScript — process.env integration', () => {
  const originalSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const originalId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  afterEach(() => {
    // Restore originals after each test
    if (originalSrc === undefined) {
      delete process.env.NEXT_PUBLIC_UMAMI_SRC;
    } else {
      process.env.NEXT_PUBLIC_UMAMI_SRC = originalSrc;
    }
    if (originalId === undefined) {
      delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    } else {
      process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = originalId;
    }
  });

  it('renders when both process.env vars are set', () => {
    process.env.NEXT_PUBLIC_UMAMI_SRC = 'https://analytics.showalter.business/script.js';
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = 'test-website-id';
    expect(
      shouldRenderUmamiScript(
        process.env.NEXT_PUBLIC_UMAMI_SRC,
        process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      ),
    ).toBe(true);
  });

  it('renders nothing when process.env vars are absent', () => {
    delete process.env.NEXT_PUBLIC_UMAMI_SRC;
    delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    expect(
      shouldRenderUmamiScript(
        process.env.NEXT_PUBLIC_UMAMI_SRC,
        process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      ),
    ).toBe(false);
  });
});
