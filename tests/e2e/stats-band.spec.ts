import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';

/**
 * Phase 11 — Landing-page stats band E2E.
 *
 * Two scenarios:
 *   1. Stats band visible — seeded with enough submitted reviews (≥ default min
 *      of 3) and show_landing_stats=true → <section id="stats"> renders.
 *   2. Stats band absent — show_landing_stats toggled to false → section absent.
 *
 * We manipulate the DB directly (same approach as other E2E specs) to set up
 * state without going through the full admin UI flow.
 */

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5827}`;
const DB_PATH = resolve(process.cwd(), 'dev.db');

/**
 * Insert N submitted reviews into the dev.db, using the customers table to
 * satisfy the FK constraint.
 */
function seedReviews(count: number): void {
  const sqlite = new Database(DB_PATH);
  try {
    // Ensure there's at least one customer to use as owner
    const existingCustomer = sqlite
      .prepare('SELECT id FROM customers LIMIT 1')
      .get() as { id: number } | undefined;

    let customerId: number;
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const result = sqlite
        .prepare(
          `INSERT INTO customers (name, phone, created_at, updated_at)
           VALUES ('E2E Customer', '+19131112222', datetime('now'), datetime('now'))`,
        )
        .run();
      customerId = result.lastInsertRowid as number;
    }

    // Delete any previously seeded E2E reviews to keep test idempotent
    sqlite.prepare(`DELETE FROM reviews WHERE token LIKE 'e2e-stats-%'`).run();

    for (let i = 0; i < count; i++) {
      sqlite
        .prepare(
          `INSERT INTO reviews (customer_id, token, status, rating, requested_at, submitted_at)
           VALUES (?, ?, 'submitted', 5, datetime('now'), datetime('now'))`,
        )
        .run(customerId, `e2e-stats-${i}-${Date.now()}`);
    }
  } finally {
    sqlite.close();
  }
}

/**
 * Set show_landing_stats in site_config.
 */
function setShowLandingStats(value: 0 | 1): void {
  const sqlite = new Database(DB_PATH);
  try {
    sqlite
      .prepare('UPDATE site_config SET show_landing_stats = ?')
      .run(value);
  } finally {
    sqlite.close();
  }
}

/**
 * Set min_reviews_for_landing_stats in site_config.
 */
function setMinReviews(value: number): void {
  const sqlite = new Database(DB_PATH);
  try {
    sqlite
      .prepare('UPDATE site_config SET min_reviews_for_landing_stats = ?')
      .run(value);
  } finally {
    sqlite.close();
  }
}

test.describe('stats band', () => {
  test.afterEach(async () => {
    // Restore defaults to avoid polluting other tests
    const sqlite = new Database(DB_PATH);
    try {
      sqlite.prepare('UPDATE site_config SET show_landing_stats = 1, min_reviews_for_landing_stats = 3').run();
      sqlite.prepare(`DELETE FROM reviews WHERE token LIKE 'e2e-stats-%'`).run();
    } finally {
      sqlite.close();
    }
  });

  test('stats band is visible when seeded with enough reviews and gate is on', async ({ page }) => {
    // Ensure gate is enabled and there are enough reviews
    setShowLandingStats(1);
    setMinReviews(3);
    seedReviews(3);

    await page.goto('/');

    const statsBand = page.locator('section#stats');
    await expect(statsBand).toBeVisible();

    // Should show "Avg Rating" card
    await expect(statsBand.getByText(/avg rating/i)).toBeVisible();
    // Should show "Jobs Completed" card
    await expect(statsBand.getByText(/jobs completed/i)).toBeVisible();
    // Should show "Customers Served" card
    await expect(statsBand.getByText(/customers served/i)).toBeVisible();
    // Should show "Year(s) in Business" card
    await expect(statsBand.getByText(/year.* in business/i)).toBeVisible();

    // Rating should be a number (5.0 from all 5-star reviews)
    await expect(statsBand.getByText(/⭐/)).toBeVisible();
  });

  test('stats band is absent when show_landing_stats is false', async ({ page }) => {
    setShowLandingStats(0);
    setMinReviews(1);
    seedReviews(5);

    await page.goto('/');

    const statsBand = page.locator('section#stats');
    await expect(statsBand).not.toBeVisible();
  });

  test('stats band is absent when review count is below minimum threshold', async ({ page }) => {
    setShowLandingStats(1);
    setMinReviews(5);
    seedReviews(2); // Below threshold of 5

    await page.goto('/');

    const statsBand = page.locator('section#stats');
    await expect(statsBand).not.toBeVisible();
  });
});
