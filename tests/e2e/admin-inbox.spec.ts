import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';

/**
 * Admin inbox E2E — Phase 6.
 *
 * Drives the full admin inbox experience end-to-end:
 *   1. Pending → accept → mark completed (full happy path)
 *   2. Accept → reschedule (old page renders pointer, new page accessible)
 *   3. Walk-in creation (new customer)
 *   4. Customer cancel → Sawyer notification badge + detail link
 *
 * Auth: re-uses the tsx helper from the schedule spec that plants a session
 * row directly, so we skip the full WebAuthn ceremony (context-scoped and
 * collides with admin-auth.spec.ts running on the same dev.db).
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

/** Wipe + reseed bookings fixtures; returns the seeded booking id + token. */
function seedPendingBooking(
  startAtIso: string,
): { bookingId: number; token: string; customerId: number } {
  const db = new Database(DB_PATH);
  try {
    db.exec(`DELETE FROM booking_attachments;`);
    db.exec(`DELETE FROM notifications;`);
    db.exec(`DELETE FROM bookings;`);
    db.exec(`DELETE FROM customer_addresses;`);
    db.exec(`DELETE FROM customers;`);

    const now = new Date().toISOString();
    const insertCustomer = db.prepare(
      'INSERT INTO customers (name, phone, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    const c = insertCustomer.run(
      'E2E Customer',
      '+19133097340',
      'e2e@example.com',
      now,
      now,
    );
    const customerId = Number(c.lastInsertRowid);

    const insertAddress = db.prepare(
      'INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at) VALUES (?, ?, ?, ?)',
    );
    const a = insertAddress.run(customerId, '500 Test Ln', now, now);
    const addressId = Number(a.lastInsertRowid);

    const svcIdRow = db.prepare('SELECT id FROM services WHERE active = 1 LIMIT 1').get() as
      | { id: number }
      | undefined;
    if (!svcIdRow) {
      throw new Error('No active service for E2E seed');
    }

    const token = `e2e-tok-${Math.random().toString(36).slice(2)}`;
    const insertBooking = db.prepare(
      `INSERT INTO bookings (
        token, customer_id, address_id, address_text,
        customer_name, customer_phone, customer_email,
        service_id, start_at, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const b = insertBooking.run(
      token,
      customerId,
      addressId,
      '500 Test Ln',
      'E2E Customer',
      '+19133097340',
      'e2e@example.com',
      svcIdRow.id,
      startAtIso,
      'Back gate on the north side.',
      'pending',
      now,
      now,
    );
    return { bookingId: Number(b.lastInsertRowid), token, customerId };
  } finally {
    db.close();
  }
}

async function openDetailPage(page: Page, bookingId: number): Promise<void> {
  await page.goto(`/admin/inbox/${bookingId}`);
  await expect(page.getByTestId('detail-status')).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Phase 6 admin inbox flows', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('accept → mark completed (happy path)', async ({ page }) => {
    // Seed a pending booking scheduled in the past so the "needs attention"
    // flow can kick in after accept. (A booking whose start_at is already
    // past won't appear in the Pending section of the Queue view because
    // that section filters to start_at >= now — so we navigate straight to
    // the detail page, which is the same flow Sawyer uses from a push
    // notification link in production.)
    const { bookingId } = seedPendingBooking('2025-01-01T12:00:00.000Z');

    // Open detail + accept.
    await openDetailPage(page, bookingId);
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'pending',
    );
    await page.getByTestId('action-accept').click();
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'accepted',
      { timeout: 10_000 },
    );

    // After accept, because the start_at is in the past, we should now see
    // mark-completed / mark-no-show actions.
    await expect(page.getByTestId('action-mark-completed')).toBeVisible();

    // Accept the confirm() dialog fired by mark-completed.
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('action-mark-completed').click();
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'completed',
      { timeout: 10_000 },
    );
    // Completed is terminal — no actions rendered.
    await expect(page.getByTestId('detail-no-actions')).toBeVisible();
  });

  test('accept → reschedule: old page renders pointer, new page is live', async ({
    page,
  }) => {
    const { bookingId, token: oldToken } = seedPendingBooking(
      '2027-01-01T12:00:00.000Z',
    );

    await openDetailPage(page, bookingId);
    await page.getByTestId('action-accept').click();
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'accepted',
      { timeout: 10_000 },
    );

    // Trigger reschedule — open form + pick a new datetime in the far future.
    await page.getByTestId('action-reschedule-open').click();
    await page.getByTestId('reschedule-datetime').fill('2027-02-02T09:00');
    await page.getByTestId('reschedule-submit').click();

    // Server routes us to the new booking's detail page.
    await page.waitForURL(/\/admin\/inbox\/\d+$/, { timeout: 10_000 });
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'accepted',
      { timeout: 10_000 },
    );
    // "Replaces" banner links back to the original.
    await expect(page.getByTestId('detail-replaces')).toBeVisible();

    // Old customer-facing page now renders the rescheduled-to pointer.
    await page.goto(`/bookings/${oldToken}`);
    await expect(page.getByTestId('rescheduled-to')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId('rescheduled-to-link')).toBeVisible();
  });

  test('walk-in creation (new customer) — status starts accepted', async ({
    page,
  }) => {
    // Clean slate so the walk-in doesn't collide with a seeded slot.
    const db = new Database(DB_PATH);
    try {
      db.exec(`DELETE FROM booking_attachments;`);
      db.exec(`DELETE FROM notifications;`);
      db.exec(`DELETE FROM bookings;`);
      db.exec(`DELETE FROM customer_addresses;`);
      db.exec(`DELETE FROM customers;`);
    } finally {
      db.close();
    }

    await page.goto('/admin/bookings/new');
    await expect(page.getByTestId('walkin-form')).toBeVisible();

    // Force the "new customer" mode even if recent customers exist.
    await page.getByTestId('mode-new').click();

    await page.getByTestId('input-name').fill('Walk-In Customer');
    await page.getByTestId('input-phone').fill('913-555-0199');
    await page.getByTestId('input-address').fill('1 Walk-In Ln');

    // Pick the first active service. Use selectOption with index 0 so we
    // don't have to wait for <option> visibility (options inside a closed
    // native <select> are hidden).
    await page.getByTestId('select-service').selectOption({ index: 0 });

    // Far-future start time so advance-notice warning does NOT fire —
    // we want the baseline "no warnings → direct insert" path.
    await page.getByTestId('input-start-at').fill('2027-03-03T09:00');

    await page.getByTestId('submit-walkin').click();
    await page.waitForURL(/\/admin\/inbox\/\d+$/, { timeout: 15_000 });

    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'accepted',
    );
  });

  test('customer cancel → Sawyer sees badge + notification + opens booking', async ({
    page,
  }) => {
    const { token, bookingId } = seedPendingBooking(
      '2027-04-04T10:00:00.000Z',
    );

    // Customer cancels via the public page.
    await page.goto(`/bookings/${token}`);
    await page.getByTestId('cancel-open').click();
    await page.getByTestId('cancel-confirm').click();
    await expect(page.getByTestId('booking-status')).toHaveAttribute(
      'data-status',
      'canceled',
      { timeout: 10_000 },
    );

    // Sawyer opens the admin — badge is non-zero.
    await page.goto('/admin');
    await expect(page.getByTestId('unread-badge')).not.toHaveAttribute(
      'data-unread',
      '0',
      { timeout: 10_000 },
    );

    // Notifications page lists the cancel + links to the booking detail.
    await page.goto('/admin/notifications');
    await expect(page.getByTestId('notifications-list')).toBeVisible();
    const link = page.locator('[data-testid^="notification-link-"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(new RegExp(`/admin/inbox/${bookingId}$`), {
      timeout: 10_000,
    });
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'canceled',
    );

    // Mark all read; badge returns to 0.
    await page.goto('/admin/notifications');
    await page.getByTestId('mark-all-read').click();
    await page.goto('/admin');
    await expect(page.getByTestId('unread-badge')).toHaveAttribute(
      'data-unread',
      '0',
      { timeout: 10_000 },
    );
  });
});
