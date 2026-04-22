import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/db/test-helpers';

let testHandle: ReturnType<typeof createTestDb>;

describe('GET /bookings/<token>/ics', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    vi.resetModules();
    testHandle = createTestDb();
    tmpDbPath = testHandle.dbPath;
    process.env.DATABASE_URL = `file:${tmpDbPath}`;

    const { sqlite } = testHandle;
    // Seed fixture data (site_config row already exists from migration)
    sqlite.exec(`
      UPDATE site_config SET timezone = 'America/Chicago' WHERE id = 1;

      INSERT INTO services (name, description) VALUES ('Mowing', 'Mow + edge');
      INSERT INTO customers (name, phone, created_at, updated_at)
        VALUES ('Jane', '+19135551212', '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
      INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at)
        VALUES (1, '123 Main St', '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');

      INSERT INTO bookings
        (token, customer_id, address_id, address_text, customer_name, customer_phone, customer_email,
         service_id, start_at, notes, status, created_at, updated_at)
        VALUES ('tok-abc', 1, 1, '123 Main St', 'Jane', '+19135551212', null,
                1, '2026-05-01T14:30:00.000Z', 'Back gate', 'accepted',
                '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
    `);
  });

  afterEach(() => {
    testHandle.cleanup();
    delete process.env.DATABASE_URL;
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
    expect(body).toContain('UID:booking-tok-abc@sawyer.showalter.business');
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
