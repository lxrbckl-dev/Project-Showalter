import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';

/**
 * Phase 7 confirmation-button E2E.
 *
 * After logging in as admin and accepting a pending booking, the detail
 * page should surface a "Send email confirmation" / "Send text confirmation"
 * mailto/sms pair whose hrefs contain the interpolated template body.
 */

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5827}`;
const DB_PATH = resolve(process.cwd(), 'dev.db');

function mintAdminSession(): { token: string } {
  const out = execSync('pnpm exec tsx tests/e2e/schedule-session.ts', {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
      ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? 'alex@test.com',
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

function seedPendingBookingWithEmail(
  startAtIso: string,
  email: string | null,
): { bookingId: number; token: string } {
  const db = new Database(DB_PATH);
  try {
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
      .run('E2E Customer', '+19133097340', email, now, now);
    const customerId = Number(c.lastInsertRowid);

    const a = db
      .prepare(
        'INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at) VALUES (?, ?, ?, ?)',
      )
      .run(customerId, '500 Test Ln', now, now);
    const addressId = Number(a.lastInsertRowid);

    const svc = db
      .prepare('SELECT id FROM services WHERE active = 1 LIMIT 1')
      .get() as { id: number } | undefined;
    if (!svc) throw new Error('No active service');

    const token = `e2e-conf-${Math.random().toString(36).slice(2)}`;
    const b = db
      .prepare(
        `INSERT INTO bookings
          (token, customer_id, address_id, address_text, customer_name,
           customer_phone, customer_email, service_id, start_at, notes,
           status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        token,
        customerId,
        addressId,
        '500 Test Ln',
        'E2E Customer',
        '+19133097340',
        email,
        svc.id,
        startAtIso,
        'Back gate',
        'pending',
        now,
        now,
      );
    return { bookingId: Number(b.lastInsertRowid), token };
  } finally {
    db.close();
  }
}

async function openDetail(page: Page, id: number): Promise<void> {
  await page.goto(`/admin/inbox/${id}`);
  await expect(page.getByTestId('detail-status')).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Phase 7 confirmation buttons', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('accept → confirmation buttons render with interpolated mailto + sms hrefs', async ({
    page,
  }) => {
    const { bookingId } = seedPendingBookingWithEmail(
      '2027-05-01T14:30:00.000Z',
      'e2e@example.com',
    );

    await openDetail(page, bookingId);
    await page.getByTestId('action-accept').click();
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'accepted',
      { timeout: 10_000 },
    );

    const confirmations = page.getByTestId('detail-confirmations');
    await expect(confirmations).toBeVisible();

    const emailBtn = page.getByTestId('send-confirmation-email');
    const smsBtn = page.getByTestId('send-confirmation-sms');
    await expect(emailBtn).toBeVisible();
    await expect(smsBtn).toBeVisible();

    const emailHref = await emailBtn.getAttribute('href');
    const smsHref = await smsBtn.getAttribute('href');
    expect(emailHref).toMatch(/^mailto:e2e@example\.com\?subject=/);
    expect(emailHref).toContain('body=');
    // URL-decoded body should contain the customer name + service.
    const decodedEmail = decodeURIComponent(
      (emailHref ?? '').split('body=')[1] ?? '',
    );
    expect(decodedEmail).toContain('E2E Customer');
    // A service exists in the active services table — confirmation body
    // always names one. The default service for Sawyer's seed is "Mowing".
    expect(decodedEmail.length).toBeGreaterThan(20);

    expect(smsHref).toMatch(/^sms:\+19133097340\?body=/);
    const decodedSms = decodeURIComponent(
      (smsHref ?? '').split('body=')[1] ?? '',
    );
    expect(decodedSms).toContain('E2E Customer');
  });

  test('accept with no customer email → email button disabled, sms still works', async ({
    page,
  }) => {
    const { bookingId } = seedPendingBookingWithEmail(
      '2027-06-02T14:30:00.000Z',
      null,
    );

    await openDetail(page, bookingId);
    await page.getByTestId('action-accept').click();
    await expect(page.getByTestId('detail-status')).toHaveAttribute(
      'data-status',
      'accepted',
      { timeout: 10_000 },
    );

    const emailBtn = page.getByTestId('send-confirmation-email');
    await expect(emailBtn).toBeVisible();
    await expect(emailBtn).toBeDisabled();

    const smsBtn = page.getByTestId('send-confirmation-sms');
    await expect(smsBtn).toBeVisible();
    const smsHref = await smsBtn.getAttribute('href');
    expect(smsHref).toMatch(/^sms:\+19133097340\?body=/);
  });
});
