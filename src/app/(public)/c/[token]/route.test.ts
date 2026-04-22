import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/db/test-helpers';

let testHandle: ReturnType<typeof createTestDb>;

describe('GET /c/<token>', () => {
  beforeEach(() => {
    vi.resetModules();
    testHandle = createTestDb();
    process.env.DATABASE_URL = `file:${testHandle.dbPath}`;

    const { sqlite } = testHandle;
    // Seed fixture data (site_config row already exists from migration)
    sqlite.exec(`
      INSERT INTO services (name, description) VALUES ('Test Service', 'desc');
      INSERT INTO customers (name, phone, created_at, updated_at)
        VALUES ('Jane', '+19135551212', '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
      INSERT INTO customer_addresses (customer_id, address, created_at, last_used_at)
        VALUES (1, '1 Main', '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
      INSERT INTO bookings
        (token, customer_id, address_id, address_text, customer_name, customer_phone, customer_email,
         service_id, start_at, notes, status, created_at, updated_at)
        VALUES ('known-token', 1, 1, '1 Main', 'Jane', '+19135551212', null,
                1, '2026-05-01T14:30:00.000Z', null, 'accepted',
                '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
    `);
  });

  afterEach(() => {
    testHandle.cleanup();
    delete process.env.DATABASE_URL;
  });

  it('302s to /bookings/<token>/ics for a known token', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:5827/c/known-token'),
      { params: Promise.resolve({ token: 'known-token' }) },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:5827/bookings/known-token/ics',
    );
  });

  it('404s on an unknown token (vague, no enumeration)', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:5827/c/no-such'),
      { params: Promise.resolve({ token: 'no-such' }) },
    );
    expect(response.status).toBe(404);
  });

  it('404s on an empty token param', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:5827/c/'),
      { params: Promise.resolve({ token: '' }) },
    );
    expect(response.status).toBe(404);
  });
});
