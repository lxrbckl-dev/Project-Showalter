import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { bookings } from '@/db/schema/bookings';
import { __resetRateLimitStore } from '@/lib/rate-limit';
import { submitBookingCore } from './submit';

/**
 * Unit tests for the booking-submit pipeline.
 *
 * We inject DB, IP, and a stub uploader so the test never touches disk or
 * the real rate-limit store. The partial-UNIQUE-index double-booking test is
 * covered here — we insert a held row and assert a second submit for the
 * same start_at returns `kind: 'slot_taken'`.
 */

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  // Minimal schema subset required by the submit action.
  sqlite.exec(`
    CREATE TABLE site_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT, hero_image_path TEXT,
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
    INSERT INTO site_config (min_advance_notice_hours, booking_spacing_minutes, timezone)
      VALUES (0, 30, 'UTC');

    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_cents INTEGER,
      price_suffix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO services (name, description, active) VALUES ('Mowing', 'Mow the lawn', 1);
    INSERT INTO services (name, description, active) VALUES ('Retired Service', 'Old thing', 0);

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT,
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      last_booking_at TEXT
    );
    CREATE UNIQUE INDEX customers_email_unique ON customers(email) WHERE email IS NOT NULL;

    CREATE TABLE customer_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      address TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL
    );

    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      address_id INTEGER NOT NULL,
      address_text TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      service_id INTEGER NOT NULL,
      start_at TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_at TEXT,
      rescheduled_to_id INTEGER
    );
    CREATE UNIQUE INDEX bookings_active_start
      ON bookings(start_at) WHERE status IN ('pending', 'accepted');

    CREATE TABLE booking_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      booking_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      kind TEXT NOT NULL, payload_json TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      booking_id INTEGER
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append('serviceId', '1');
  fd.append('startAt', '2026-05-01T15:00:00.000Z');
  fd.append('name', 'Jane Doe');
  fd.append('phone', '913-309-7340');
  fd.append('email', 'jane@example.com');
  fd.append('address', '123 Main St');
  fd.append('notes', 'Back gate is around the side.');
  fd.append('honeypot', '');
  for (const [k, v] of Object.entries(overrides)) {
    fd.set(k, v);
  }
  return fd;
}

// Stub uploader — never touches disk.
const noopUploader = async (
  file: File,
  _opts: { subdir: string; maxBytes: number },
) => ({
  filePath: `${_opts.subdir}/fake.jpg`,
  mimeType: 'image/jpeg',
  sizeBytes: file.size,
  originalFilename: file.name || 'fake.jpg',
});

describe('submitBookingCore', () => {
  beforeEach(() => {
    __resetRateLimitStore();
  });

  it('happy path: creates customer, address, booking; returns token', async () => {
    const { sqlite, db } = makeDb();
    const result = await submitBookingCore({
      formData: buildForm(),
      db,
      ip: '1.2.3.4',
      uploader: noopUploader,
      generateToken: () => 'test-token-happy',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.token).toBe('test-token-happy');
    expect(typeof result.bookingId).toBe('number');
    expect(result.serviceName).toBe('Mowing');
    const rows = db.select().from(bookings).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].customerPhone).toBe('+19133097340');
    expect(rows[0].customerEmail).toBe('jane@example.com');
    expect(rows[0].status).toBe('pending');
    expect(rows[0].addressText).toBe('123 Main St');
    sqlite.close();
  });

  it('validation: rejects short name + invalid phone', async () => {
    const { sqlite, db } = makeDb();
    const result = await submitBookingCore({
      formData: buildForm({ name: '', phone: '555' }),
      db,
      ip: '1.2.3.4',
      uploader: noopUploader,
    });
    if (result.ok) throw new Error('expected validation failure');
    expect(result.kind).toBe('validation');
    expect(result.fieldErrors.name?.[0]).toMatch(/name/i);
    expect(result.fieldErrors.phone?.[0]).toMatch(/US phone/i);
    sqlite.close();
  });

  it('honeypot: fills honeypot → returns ok with random token; no booking row', async () => {
    const { sqlite, db } = makeDb();
    const result = await submitBookingCore({
      formData: buildForm({ honeypot: 'bot was here' }),
      db,
      ip: '1.2.3.4',
      uploader: noopUploader,
      generateToken: () => 'fake-honeypot-token',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.token).toBe('fake-honeypot-token');
    // Honeypot path omits bookingId/serviceName — it never created a row.
    expect(result.bookingId).toBeUndefined();
    expect(db.select().from(bookings).all()).toHaveLength(0);
    sqlite.close();
  });

  it('rate limit: blocks after N submissions from the same IP', async () => {
    const { sqlite, db } = makeDb();
    // Use a very small limit for the test.
    const submit = (token: string) =>
      submitBookingCore({
        formData: buildForm({
          startAt: `2026-05-0${token.length}T15:00:00.000Z`,
        }),
        db,
        ip: '9.9.9.9',
        uploader: noopUploader,
        generateToken: () => token,
        rateLimitPerHour: 2,
      });

    await submit('t1');
    await submit('t2');
    const third = await submit('t3');
    if (third.ok) throw new Error('expected rate-limit block');
    expect(third.kind).toBe('rate_limited');
    expect(third.retryAfterMs).toBeGreaterThan(0);
    sqlite.close();
  });

  it('inactive service: returns service_inactive', async () => {
    const { sqlite, db } = makeDb();
    const result = await submitBookingCore({
      formData: buildForm({ serviceId: '2' }),
      db,
      ip: '1.2.3.4',
      uploader: noopUploader,
    });
    if (result.ok) throw new Error('expected service_inactive');
    expect(result.kind).toBe('service_inactive');
    sqlite.close();
  });

  it('double-book: second concurrent submit for same slot returns slot_taken', async () => {
    const { sqlite, db } = makeDb();
    const first = await submitBookingCore({
      formData: buildForm(),
      db,
      ip: '1.1.1.1',
      uploader: noopUploader,
      generateToken: () => 'first',
    });
    expect(first.ok).toBe(true);

    // Second submission: different IP to skip rate-limit, same start_at.
    const second = await submitBookingCore({
      formData: buildForm({ name: 'Rival Customer', phone: '913-309-7341' }),
      db,
      ip: '2.2.2.2',
      uploader: noopUploader,
      generateToken: () => 'second',
    });
    if (second.ok) throw new Error('expected slot_taken');
    expect(second.kind).toBe('slot_taken');
    sqlite.close();
  });

  it('slot re-bookable after the first booking is canceled', async () => {
    const { sqlite, db } = makeDb();
    const first = await submitBookingCore({
      formData: buildForm(),
      db,
      ip: '1.1.1.1',
      uploader: noopUploader,
      generateToken: () => 'original',
    });
    expect(first.ok).toBe(true);

    // Simulate cancellation (just flip the status; the real action does
    // this plus a notification).
    sqlite
      .prepare(`UPDATE bookings SET status = 'canceled' WHERE token = 'original'`)
      .run();

    const second = await submitBookingCore({
      formData: buildForm({ name: 'New Customer', phone: '913-309-7341' }),
      db,
      ip: '3.3.3.3',
      uploader: noopUploader,
      generateToken: () => 'replacement',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('expected ok');
    expect(second.token).toBe('replacement');
    sqlite.close();
  });

  it('Zod default + honeypot absent: empty honeypot passes', async () => {
    const { sqlite, db } = makeDb();
    const fd = buildForm();
    fd.delete('honeypot'); // simulate missing field
    const result = await submitBookingCore({
      formData: fd,
      db,
      ip: '4.4.4.4',
      uploader: noopUploader,
      generateToken: () => 'tok',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.token).toBe('tok');
    sqlite.close();
  });

  it('photos over the max_booking_photos cap are silently dropped', async () => {
    const { sqlite, db } = makeDb();
    // Lower the cap to 1 for this test.
    db.update(siteConfigTable).set({ maxBookingPhotos: 1 }).run();

    const fd = buildForm();
    fd.append('photos', new File(['jpeg-bytes-1'], 'a.jpg', { type: 'image/jpeg' }));
    fd.append('photos', new File(['jpeg-bytes-2'], 'b.jpg', { type: 'image/jpeg' }));

    let calls = 0;
    const countingUploader: typeof noopUploader = async (file, opts) => {
      calls++;
      return noopUploader(file, opts);
    };

    await submitBookingCore({
      formData: fd,
      db,
      ip: '5.5.5.5',
      uploader: countingUploader,
      generateToken: () => 'with-photos',
    });
    expect(calls).toBe(1);
    sqlite.close();
  });

  it('uploader errors on a single photo do NOT fail the booking', async () => {
    const { sqlite, db } = makeDb();
    const fd = buildForm();
    fd.append('photos', new File(['x'], 'a.jpg', { type: 'image/jpeg' }));

    const failingUploader: typeof noopUploader = async () => {
      throw new Error('disk full');
    };

    const result = await submitBookingCore({
      formData: fd,
      db,
      ip: '6.6.6.6',
      uploader: failingUploader,
      generateToken: () => 'survives',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.token).toBe('survives');
    expect(db.select().from(bookings).all()).toHaveLength(1);
    sqlite.close();
  });
});
