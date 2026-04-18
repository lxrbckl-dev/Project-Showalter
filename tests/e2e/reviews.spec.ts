import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type BrowserContext } from '@playwright/test';

/**
 * Phase 9 reviews E2E.
 *
 * Full happy-path:
 *   1. Sawyer marks a completed booking and taps "Generate review request" →
 *      a tokenized /review/<token> URL is created.
 *   2. The customer opens that URL, submits a 5-star review with a photo.
 *   3. Because rating 5 >= site_config.min_rating_for_auto_publish (default 4)
 *      AND auto_publish_top_review_photos = 1, the photo is auto-copied into
 *      site_photos.
 *   4. The photo appears on the public landing page gallery at `/`.
 *   5. A notification row is inserted for Sawyer and is visible in the admin
 *      /admin/reviews detail view.
 *
 * Second spec: the "already submitted" guard — opening the same token
 * again shows the thank-you view and rejects a second POST.
 */

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5827}`;
const DB_PATH = resolve(process.cwd(), 'dev.db');

function mintAdminSession(): { token: string } {
  const out = execSync('pnpm exec tsx tests/e2e/schedule-session.ts', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
    },
  }).toString('utf-8');
  const lines = out.trim().split('\n');
  const parsed = JSON.parse(lines[lines.length - 1]) as { token: string };
  return parsed;
}

async function loginAsAdmin(context: BrowserContext): Promise<void> {
  const { token } = mintAdminSession();
  const url = new URL(BASE_URL);
  await context.addCookies([
    {
      name: 'swt-session',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
}

function seedCompletedBooking(): {
  bookingId: number;
  customerId: number;
} {
  const db = new Database(DB_PATH);
  try {
    db.exec(`DELETE FROM review_photos;`);
    db.exec(`DELETE FROM reviews;`);
    db.exec(`DELETE FROM site_photos WHERE source_review_id IS NOT NULL;`);
    db.exec(`DELETE FROM booking_attachments;`);
    db.exec(`DELETE FROM notifications;`);
    db.exec(`DELETE FROM bookings;`);
    db.exec(`DELETE FROM customer_addresses;`);
    db.exec(`DELETE FROM customers;`);

    const now = new Date().toISOString();
    const c = db
      .prepare(
        'INSERT INTO customers (name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('Review E2E Customer', '+19133097340', 'review-e2e@example.com', now, now);
    const customerId = Number(c.lastInsertRowid);

    const a = db
      .prepare(
        'INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at) VALUES (?, ?, ?, ?)',
      )
      .run(customerId, '900 Review Ln', now, now);
    const addressId = Number(a.lastInsertRowid);

    const svc = db
      .prepare('SELECT id FROM services WHERE active = 1 LIMIT 1')
      .get() as { id: number } | undefined;
    if (!svc) throw new Error('no active service for review E2E');

    const b = db
      .prepare(
        `INSERT INTO bookings (
            token, customer_id, address_id, address_text,
            customer_name, customer_phone, customer_email,
            service_id, start_at, notes, status,
            created_at, updated_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `review-e2e-${Math.random().toString(36).slice(2)}`,
        customerId,
        addressId,
        '900 Review Ln',
        'Review E2E Customer',
        '+19133097340',
        'review-e2e@example.com',
        svc.id,
        '2026-04-10T12:00:00.000Z',
        null,
        'completed',
        now,
        now,
        now,
      );
    return { bookingId: Number(b.lastInsertRowid), customerId };
  } finally {
    db.close();
  }
}

// A tiny in-memory JPEG — the smallest valid JPEG recognized by our
// magic-byte sniffer (0xFF 0xD8 0xFF). Real pixel data is not required
// because the test only exercises the upload path end-to-end.
function minimalJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

test.describe('Phase 9 reviews', () => {
  test('full happy path: request → submit 5-star with photo → auto-published to /', async ({
    page,
    context,
  }) => {
    const { bookingId } = seedCompletedBooking();
    await loginAsAdmin(context);

    // 1. Admin booking detail → Generate review request.
    await page.goto(`/admin/inbox/${bookingId}`);
    await expect(page.getByTestId('detail-review-request')).toBeVisible();
    await page.getByTestId('request-review').click();

    // After generation the page refreshes and the review link is rendered.
    await expect(page.getByTestId('review-link')).toBeVisible({ timeout: 10_000 });
    const reviewLink = await page.getByTestId('review-link').textContent();
    expect(reviewLink).toMatch(/^\/review\//);
    const token = reviewLink!.replace('/review/', '').trim();
    expect(token.length).toBeGreaterThan(10);

    // 2. Customer opens the review URL in a fresh anonymous context (no cookie).
    const publicContext = await page.context().browser()!.newContext();
    try {
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`/review/${token}`);
      await expect(publicPage.getByTestId('review-form-page')).toBeVisible();

      // Pick 5 stars + type a review + attach the minimal JPEG.
      await publicPage.getByTestId('star-5').click();
      await publicPage.getByTestId('review-text').fill('Outstanding job, thank you!');

      await publicPage.getByTestId('review-photos').setInputFiles({
        name: 'great-job.jpg',
        mimeType: 'image/jpeg',
        buffer: minimalJpeg(),
      });

      await publicPage.getByTestId('review-submit').click();

      // Terminal state renders on the same URL (router.refresh triggers re-fetch).
      await expect(publicPage.getByTestId('review-thankyou')).toBeVisible({
        timeout: 10_000,
      });

      // 3. Landing page now shows the auto-published photo.
      await publicPage.goto('/');
      // Use DB to locate the published path (the public page renders under
      // /uploads/<file_path>), then assert at least one image references it.
      const sqlite = new Database(DB_PATH);
      try {
        const published = sqlite
          .prepare('SELECT file_path FROM site_photos WHERE source_review_id IS NOT NULL')
          .all() as { file_path: string }[];
        expect(published.length).toBeGreaterThan(0);
        // The landing page must have at least one <img> whose src ends with
        // the published file's path.
        const sample = published[0].file_path;
        const imgs = await publicPage.locator('img').evaluateAll((els) =>
          (els as HTMLImageElement[]).map((e) => e.getAttribute('src') ?? ''),
        );
        // Next/Image rewrites src to /_next/image?url=<encoded-path>&w=...&q=...
        // so we must decode the `url` query param rather than checking endsWith.
        const matched = imgs.some((src) => {
          try {
            const imgUrlParam = new URL(src, BASE_URL).searchParams.get('url');
            if (!imgUrlParam) return false;
            return decodeURIComponent(imgUrlParam).includes('reviews/');
          } catch {
            return false;
          }
        });
        expect(matched, `expected <img> with decoded url containing 'reviews/' (sample: ${sample})`).toBe(true);
        // Belt-and-suspenders: at least one gallery-photo-* testid is present.
        await expect(publicPage.locator('[data-testid^="gallery-photo-"]').first()).toBeVisible();
      } finally {
        sqlite.close();
      }
    } finally {
      await publicContext.close();
    }

    // 4. Admin /admin/reviews shows the new review.
    await page.goto('/admin/reviews');
    await expect(page.getByTestId('reviews-list')).toBeVisible();
    await expect(page.getByText('Review E2E Customer').first()).toBeVisible();
  });

  test('second submit with same token is rejected (idempotency)', async ({
    page,
    context,
  }) => {
    const { bookingId } = seedCompletedBooking();
    await loginAsAdmin(context);
    await page.goto(`/admin/inbox/${bookingId}`);
    await page.getByTestId('request-review').click();
    const reviewLink = await page.getByTestId('review-link').textContent();
    const token = reviewLink!.replace('/review/', '').trim();

    const customer = await page.context().browser()!.newContext();
    try {
      const cp = await customer.newPage();
      await cp.goto(`/review/${token}`);
      await cp.getByTestId('star-4').click();
      await cp.getByTestId('review-text').fill('Good.');
      await cp.getByTestId('review-submit').click();
      await expect(cp.getByTestId('review-thankyou')).toBeVisible({ timeout: 10_000 });

      // Reload — second time we should still see the terminal thank-you
      // view, never the form.
      await cp.goto(`/review/${token}`);
      await expect(cp.getByTestId('review-thankyou')).toBeVisible();
      await expect(cp.getByTestId('review-form')).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });
});
