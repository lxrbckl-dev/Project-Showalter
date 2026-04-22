import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { bookings } from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import { createTestDb } from '@/db/test-helpers';
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

function makeDb(): ReturnType<typeof createTestDb> & { db: Db } {
  const handle = createTestDb({ inMemory: true });
  const db = handle.db as Db;
  // Migrations pre-insert site_config with id=1. Override for test constraints.
  db.update(siteConfigTable)
    .set({ minAdvanceNoticeHours: 0, bookingSpacingMinutes: 30, timezone: 'UTC' })
    .run();
  // Seed services (migrations don't seed data).
  db.insert(services).values({ name: 'Mowing', description: 'Mow the lawn', active: 1 }).run();
  db.insert(services).values({ name: 'Retired Service', description: 'Old thing', active: 0 }).run();
  return { ...handle, db };
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
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('validation: rejects short name + invalid phone', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('honeypot: fills honeypot → returns ok with random token; no booking row', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('rate limit: blocks after N submissions from the same IP', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('inactive service: returns service_inactive', async () => {
    const { db, cleanup } = makeDb();
    const result = await submitBookingCore({
      formData: buildForm({ serviceId: '2' }),
      db,
      ip: '1.2.3.4',
      uploader: noopUploader,
    });
    if (result.ok) throw new Error('expected service_inactive');
    expect(result.kind).toBe('service_inactive');
    cleanup();
  });

  it('double-book: second concurrent submit for same slot returns slot_taken', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('slot re-bookable after the first booking is canceled', async () => {
    const { sqlite, db, cleanup } = makeDb();
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
    cleanup();
  });

  it('Zod default + honeypot absent: empty honeypot passes', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('photos over the max_booking_photos cap are silently dropped', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });

  it('uploader errors on a single photo do NOT fail the booking', async () => {
    const { db, cleanup } = makeDb();
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
    cleanup();
  });
});
