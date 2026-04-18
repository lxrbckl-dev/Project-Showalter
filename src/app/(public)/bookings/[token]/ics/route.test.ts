import { unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let tmpDbPath: string;

function setupDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'ics-route-test-'));
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
      template_review_request_sms TEXT
    );
    INSERT INTO site_config (id, timezone) VALUES (1, 'America/Chicago');

    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT NOT NULL,
      price_cents INTEGER, price_suffix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO services (id, name, description)
      VALUES (1, 'Mowing', 'Mow + edge');

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
    INSERT INTO bookings
      (token, customer_id, address_id, address_text, customer_name, customer_phone, customer_email,
       service_id, start_at, notes, status, created_at, updated_at)
      VALUES ('tok-abc', 1, 1, '123 Main St', 'Jane', '+19135551212', null,
              1, '2026-05-01T14:30:00.000Z', 'Back gate', 'accepted',
              '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
  `);
  return sqlite;
}

describe('GET /bookings/<token>/ics', () => {
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

  it('returns 200 with a valid VCALENDAR body and text/calendar content-type', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:5827/bookings/tok-abc/ics'),
      { params: Promise.resolve({ token: 'tok-abc' }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    const body = await response.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('SUMMARY:Mowing');
    expect(body).toContain('LOCATION:123 Main St');
    expect(body).toContain('DESCRIPTION:Back gate');
    // TZID from site_config.
    expect(body).toContain('DTSTART;TZID=America/Chicago:');
    // VALARM reminder 24h before.
    expect(body).toContain('BEGIN:VALARM');
    expect(body).toContain('TRIGGER:-PT24H');
    // UID derives from the token.
    expect(body).toContain('UID:booking-tok-abc@showalter.business');
  });

  it('returns 404 for an unknown token', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:5827/bookings/nope/ics'),
      { params: Promise.resolve({ token: 'nope' }) },
    );
    expect(response.status).toBe(404);
  });

  it('has an attachment disposition so the file downloads', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:5827/bookings/tok-abc/ics'),
      { params: Promise.resolve({ token: 'tok-abc' }) },
    );
    const cd = response.headers.get('content-disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(cd).toContain('.ics');
  });
});
