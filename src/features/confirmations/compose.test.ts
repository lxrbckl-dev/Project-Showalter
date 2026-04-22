import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb } from '@/db/test-helpers';

/**
 * compose.ts unit tests — Phase 7.
 *
 * Uses a dedicated on-disk sqlite database seeded with minimum schema for
 * bookings + services + site_config, so the feature's getDb() call returns
 * against it (via the DATABASE_URL env var hook).
 */

let testHandle: ReturnType<typeof createTestDb>;

function insertBooking(sqlite: Database.Database, overrides: Partial<{
  token: string;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string;
  startAt: string;
  notes: string | null;
  status: string;
  addressText: string;
}> = {}): number {
  const now = '2026-04-17T00:00:00.000Z';
  const row = sqlite
    .prepare(
      `INSERT INTO bookings
        (token, customer_id, address_id, address_text, customer_name, customer_phone, customer_email,
         service_id, start_at, notes, status, created_at, updated_at)
       VALUES (?, 1, 1, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .get(
      overrides.token ?? 'tok-abc',
      overrides.addressText ?? '123 Main St',
      overrides.customerName ?? 'Jane Doe',
      overrides.customerPhone ?? '+19135551212',
      overrides.customerEmail === undefined ? 'jane@example.com' : overrides.customerEmail,
      overrides.startAt ?? '2026-05-01T14:30:00.000Z',
      overrides.notes === undefined ? 'Back gate' : overrides.notes,
      overrides.status ?? 'accepted',
      now,
      now,
    ) as { id: number };
  return row.id;
}

describe('composeConfirmationForBooking', () => {
  beforeEach(() => {
    vi.resetModules();
    testHandle = createTestDb();
    process.env.DATABASE_URL = `file:${testHandle.dbPath}`;

    const { sqlite } = testHandle;
    // site_config row already exists from migration — just update it
    sqlite.exec(`
      UPDATE site_config SET timezone = 'America/Chicago' WHERE id = 1;
      INSERT INTO services (name, description, price_cents, sort_order, active)
        VALUES ('Mowing', 'Mow + edge', 4000, 1, 1);
      INSERT INTO customers (name, phone, created_at, updated_at)
        VALUES ('Jane Doe', '+19135551212', '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
      INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at)
        VALUES (1, '123 Main St', '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
    `);
  });

  afterEach(() => {
    testHandle.cleanup();
    delete process.env.DATABASE_URL;
  });

  it('composes an email href with URL-encoded body for an accepted booking', async () => {
    const id = insertBooking(testHandle.sqlite);
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(id, 'confirmation_email', {
      baseUrl: 'https://showalter.business',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('confirmation_email');
    expect(result.email?.to).toBe('jane@example.com');
    // Body is interpolated
    expect(result.email?.body).toContain('Jane Doe');
    expect(result.email?.body).toContain('Mowing');
    // Encoded body is URL-safe
    expect(result.email?.encodedBody).not.toContain(' ');
    expect(result.email?.encodedBody).not.toContain('\n');
    // Href is mailto: with subject + body params
    expect(result.email?.href).toMatch(
      /^mailto:jane@example\.com\?subject=[^&]+&body=/,
    );
  });

  it('composes an SMS href with URL-encoded body', async () => {
    const id = insertBooking(testHandle.sqlite);
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(id, 'confirmation_sms', {
      baseUrl: 'https://showalter.business',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sms?.to).toBe('+19135551212');
    expect(result.sms?.body).toContain('Jane Doe');
    expect(result.sms?.href).toMatch(
      /^sms:\+19135551212\?body=/,
    );
    // Shortlink appears in the SMS body.
    expect(result.sms?.body).toContain('https://showalter.business/c/tok-abc');
  });

  it('returns missing_email when customer email is null', async () => {
    const id = insertBooking(testHandle.sqlite, { customerEmail: null });
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(id, 'confirmation_email');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_email');
  });

  it('returns not_found when booking id does not exist', async () => {
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(9999, 'confirmation_email');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_found');
  });

  it('uses admin-overridden template body when set on site_config', async () => {
    testHandle.sqlite
      .prepare(
        `UPDATE site_config SET template_confirmation_email = ? WHERE id = 1`,
      )
      .run('OVERRIDE [name] for [service] [unknown_var]');
    const id = insertBooking(testHandle.sqlite);
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(id, 'confirmation_email');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Known vars substituted, unknown kept literal (per STACK.md rule).
    expect(result.email?.body).toBe(
      'OVERRIDE Jane Doe for Mowing [unknown_var]',
    );
  });

  it('composes decline_email with default subject', async () => {
    const id = insertBooking(testHandle.sqlite, { status: 'declined' });
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(id, 'decline_email');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email?.subject).toMatch(/service request/i);
  });
});
