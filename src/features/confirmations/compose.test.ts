import { unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * compose.ts unit tests — Phase 7.
 *
 * Uses a dedicated on-disk sqlite database seeded with minimum schema for
 * bookings + services + site_config, so the feature's getDb() call returns
 * against it (via the DATABASE_URL env var hook).
 */

let tmpDbPath: string;

function setupDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'compose-test-'));
  tmpDbPath = join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${tmpDbPath}`;

  const sqlite = new Database(tmpDbPath);
  sqlite.exec(`
    CREATE TABLE site_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT, hero_image_path TEXT,
      date_of_birth TEXT,
      sms_template TEXT,
      booking_horizon_weeks INTEGER NOT NULL DEFAULT 4,
      min_advance_notice_hours INTEGER NOT NULL DEFAULT 36,
      start_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
      booking_spacing_minutes INTEGER NOT NULL DEFAULT 60,
      max_booking_photos INTEGER NOT NULL DEFAULT 3,
      booking_photo_max_bytes INTEGER NOT NULL DEFAULT 10485760,
      photo_retention_days_after_resolve INTEGER NOT NULL DEFAULT 30,
      timezone TEXT NOT NULL DEFAULT 'America/Chicago',
      business_founded_year INTEGER NOT NULL DEFAULT 2023,
      site_title TEXT NOT NULL DEFAULT 'Sawyer Showalter Service',
      show_landing_stats INTEGER NOT NULL DEFAULT 1,
      min_reviews_for_landing_stats INTEGER NOT NULL DEFAULT 3,
      min_rating_for_auto_publish INTEGER NOT NULL DEFAULT 4,
      auto_publish_top_review_photos INTEGER NOT NULL DEFAULT 1,
      template_confirmation_email TEXT,
      template_confirmation_sms TEXT,
      template_decline_email TEXT,
      template_decline_sms TEXT,
      template_review_request_email TEXT,
      template_review_request_sms TEXT,
      owner_first_name TEXT,
      email_template_subject TEXT,
      email_template_body TEXT,
      stats_jobs_completed_override INTEGER,
      stats_customers_served_override INTEGER,
      business_start_date TEXT
    );
    INSERT INTO site_config (id, timezone) VALUES (1, 'America/Chicago');

    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT NOT NULL,
      price_cents INTEGER, price_suffix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO services (id, name, description, price_cents, sort_order, active)
      VALUES (1, 'Mowing', 'Mow + edge', 4000, 1, 1);

    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL, address_id INTEGER NOT NULL,
      address_text TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, customer_email TEXT,
      service_id INTEGER NOT NULL, start_at TEXT NOT NULL,
      notes TEXT, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, decided_at TEXT,
      rescheduled_to_id INTEGER
    );
  `);
  return sqlite;
}

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
  let sqlite: Database.Database;

  beforeEach(() => {
    vi.resetModules();
    sqlite = setupDb();
  });

  afterEach(() => {
    try {
      sqlite.close();
      unlinkSync(tmpDbPath);
    } catch {
      // best-effort
    }
  });

  it('composes an email href with URL-encoded body for an accepted booking', async () => {
    const id = insertBooking(sqlite);
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
    const id = insertBooking(sqlite);
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
    const id = insertBooking(sqlite, { customerEmail: null });
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
    sqlite
      .prepare(
        `UPDATE site_config SET template_confirmation_email = ? WHERE id = 1`,
      )
      .run('OVERRIDE [name] for [service] [unknown_var]');
    const id = insertBooking(sqlite);
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
    const id = insertBooking(sqlite, { status: 'declined' });
    const { composeConfirmationForBooking } = await import('./compose');
    const result = composeConfirmationForBooking(id, 'decline_email');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email?.subject).toMatch(/service request/i);
  });
});
