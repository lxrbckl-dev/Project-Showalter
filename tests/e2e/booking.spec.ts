import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * Full-booking-flow E2E — Phase 5.
 *
 * Covers the happy path documented in PHASES.md:
 *   1. Land on /
 *   2. Click "Request service" (now routes to /book)
 *   3. Pick a day
 *   4. Pick a start time
 *   5. Fill the form (including a photo upload)
 *   6. Submit
 *   7. Land on /bookings/<token>
 *   8. Cancel the appointment
 *   9. See the canceled-state banner
 *
 * Pre-work: the test directly seeds `weekly_template_windows` and lowers
 * `min_advance_notice_hours` to 0 so the booking form has visible slots.
 * `availability_overrides` are left empty — the weekly template alone is
 * enough for a clean horizon.
 *
 * The DB path mirrors the one declared in playwright.config.ts (repo-root
 * `dev.db`). We open it directly with better-sqlite3 — the standalone
 * server holds its own handle in WAL mode, so a second reader/writer is
 * safe.
 */

const DB_PATH = resolve(process.cwd(), 'dev.db');

/**
 * Prep the DB: open every weekday window from 08:00 to 20:00, drop the
 * min-advance-notice to zero, and tighten spacing so adjacent slots stay
 * visible. Idempotent — safe to run before each test.
 */
function seedBookingAvailability(): void {
  const db = new Database(DB_PATH);
  try {
    db.exec(`DELETE FROM weekly_template_windows;`);
    const insert = db.prepare(
      'INSERT INTO weekly_template_windows (day_of_week, start_time, end_time) VALUES (?, ?, ?)',
    );
    for (let dow = 0; dow <= 6; dow++) {
      insert.run(dow, '08:00', '20:00');
    }
    db.prepare(
      `UPDATE site_config
         SET min_advance_notice_hours = 0,
             booking_spacing_minutes = 30,
             start_time_increment_minutes = 30,
             booking_horizon_weeks = 2`,
    ).run();
    // Delete dependent rows first (FK: booking_attachments.booking_id).
    db.exec('DELETE FROM booking_attachments;');
    db.exec('DELETE FROM notifications;');
    db.exec('DELETE FROM bookings;');
  } finally {
    db.close();
  }
}

test.describe('Phase 5 booking flow', () => {
  test.beforeEach(() => {
    seedBookingAvailability();
  });

  test('full happy path: home → book → pick day/slot → submit → cancel', async ({
    page,
  }) => {
    await page.goto('/');

    // 1) CTA routes to /book
    const cta = page.getByRole('link', { name: /request service/i }).first();
    await expect(cta).toHaveAttribute('href', '/book');
    await cta.click();
    await page.waitForURL('**/book');

    // 2) At least one day should be open — pick the first open one.
    const openDay = page.locator('button[data-open="1"]').first();
    await expect(openDay).toBeVisible({ timeout: 10_000 });
    await openDay.click();

    // 3) Slot picker — pick the first slot.
    const firstSlot = page.locator('[data-testid^="slot-"]').first();
    await expect(firstSlot).toBeVisible();
    await firstSlot.click();

    // 4) Form — fill it out.
    const form = page.getByTestId('booking-form');
    await expect(form).toBeVisible();

    await page.selectOption('select[name="serviceId"]', { index: 1 });
    await page.fill('input[name="name"]', 'E2E Test Customer');
    await page.fill('input[name="phone"]', '913-555-0123');
    await page.fill('input[name="email"]', 'e2e@example.com');
    await page.fill('input[name="address"]', '500 Test Ln, Olathe KS');
    await page.fill('textarea[name="notes"]', 'Back gate on the north side.');

    // Upload a small image buffer (valid JPEG magic bytes).
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    await page.setInputFiles('input[name="photos"]', {
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBytes,
    });

    // 5) Submit + wait for redirect to /bookings/<token>.
    await page.getByTestId('booking-submit').click();
    await page.waitForURL(/\/bookings\/[^/]+$/, { timeout: 15_000 });

    // 6) Pending banner present.
    const status = page.getByTestId('booking-status');
    await expect(status).toHaveAttribute('data-status', 'pending');
    await expect(status).toContainText(/Request received/i);

    // Customer-visible details.
    await expect(page.getByText('(913) 555-0123')).toBeVisible();
    await expect(page.getByText('500 Test Ln, Olathe KS')).toBeVisible();

    // 7) Cancel flow.
    await page.getByTestId('cancel-open').click();
    await page.getByTestId('cancel-confirm').click();

    // Page reloads to show the canceled state.
    await expect(page.getByTestId('booking-status')).toHaveAttribute(
      'data-status',
      'canceled',
      { timeout: 10_000 },
    );
    await expect(page.getByTestId('booking-status')).toContainText(
      /Appointment canceled/i,
    );
  });

  test('unknown token renders 404', async ({ page }) => {
    const res = await page.goto('/bookings/not-a-real-token');
    expect(res?.status()).toBe(404);
  });

  test('zero-availability state renders friendly empty message', async ({
    page,
  }) => {
    // Wipe the template so no candidate exists anywhere in the horizon.
    const db = new Database(DB_PATH);
    try {
      db.exec('DELETE FROM weekly_template_windows;');
    } finally {
      db.close();
    }

    await page.goto('/book');
    await expect(page.getByText(/No openings right now/i)).toBeVisible();
  });
});
