import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type BrowserContext } from '@playwright/test';

/**
 * Phase 10 INDEX book E2E.
 *
 * Happy path:
 *   1. Seed a customer with name / phone / email / address.
 *   2. Navigate to /admin/index-book — customer appears in the table.
 *   3. Search by name — row is filtered to the matching customer.
 *   4. Click the row → navigate to detail page.
 *   5. Edit notes textarea, save → notes are persisted (re-navigate to verify).
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

function seedIndexBookCustomer(): { customerId: number } {
  const db = new Database(DB_PATH);
  try {
    // Clean up any prior E2E run for this test's customer
    db.exec(`DELETE FROM review_photos WHERE review_id IN (
      SELECT r.id FROM reviews r
      JOIN customers c ON c.id = r.customer_id
      WHERE c.phone = '+19135550001'
    );`);
    db.exec(`DELETE FROM reviews WHERE customer_id IN (
      SELECT id FROM customers WHERE phone = '+19135550001'
    );`);
    db.exec(`DELETE FROM bookings WHERE customer_id IN (
      SELECT id FROM customers WHERE phone = '+19135550001'
    );`);
    db.exec(`DELETE FROM customer_addresses WHERE customer_id IN (
      SELECT id FROM customers WHERE phone = '+19135550001'
    );`);
    db.exec(`DELETE FROM customers WHERE phone = '+19135550001';`);

    const now = new Date().toISOString();
    const c = db
      .prepare(
        'INSERT INTO customers (name, phone, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('INDEX E2E Customer', '+19135550001', 'index-e2e@example.com', null, now, now);
    const customerId = Number(c.lastInsertRowid);

    db.prepare(
      'INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at) VALUES (?, ?, ?, ?)',
    ).run(customerId, '1234 E2E Lane, Olathe KS', now, now);

    return { customerId };
  } finally {
    db.close();
  }
}

test.describe('Admin INDEX book', () => {
  test('search → detail → edit notes → persisted', async ({ browser }) => {
    const { customerId } = seedIndexBookCustomer();

    const context = await browser.newContext();
    await loginAsAdmin(context);
    const page = await context.newPage();

    // ── 1. Navigate to list page ──────────────────────────────────────────
    await page.goto(`${BASE_URL}/admin/index-book`);
    await expect(page.getByTestId('index-book-list')).toBeVisible();

    // ── 2. Customer appears in the table ─────────────────────────────────
    await expect(page.getByTestId('index-book-table')).toBeVisible();
    await expect(
      page.getByTestId('index-book-row').filter({ hasText: 'INDEX E2E Customer' }),
    ).toBeVisible();

    // ── 3. Search by name ────────────────────────────────────────────────
    await page.getByTestId('index-book-search-input').fill('INDEX E2E');
    await page.getByTestId('index-book-search-input').press('Enter');

    await expect(page.getByTestId('index-book-table')).toBeVisible();
    const rows = page.getByTestId('index-book-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('INDEX E2E Customer');

    // ── 4. Click row → navigate to detail ────────────────────────────────
    await page.getByTestId('index-book-row-name').click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/index-book/${customerId}`),
    );
    await expect(page.getByTestId('index-book-detail')).toBeVisible();
    await expect(page.getByTestId('customer-name')).toContainText(
      'INDEX E2E Customer',
    );

    // ── 5. Edit notes and save ───────────────────────────────────────────
    const notesTextarea = page.getByTestId('notes-textarea');
    await expect(notesTextarea).toBeVisible();
    await notesTextarea.fill('E2E test note — edited at runtime');
    await page.getByTestId('notes-save-button').click();

    // Saved indicator appears
    await expect(page.getByTestId('notes-saved-indicator')).toBeVisible({
      timeout: 5000,
    });

    // ── 6. Reload → notes are persisted ─────────────────────────────────
    await page.reload();
    await expect(page.getByTestId('notes-textarea')).toHaveValue(
      'E2E test note — edited at runtime',
    );

    await context.close();
  });
});
