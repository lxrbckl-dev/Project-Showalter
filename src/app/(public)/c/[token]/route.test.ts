import { unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let tmpDbPath: string;

function setupDb(): Database.Database {
  const dir = mkdtempSync(join(tmpdir(), 'shortlink-test-'));
  tmpDbPath = join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${tmpDbPath}`;

  const sqlite = new Database(tmpDbPath);
  sqlite.exec(`
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
      VALUES ('known-token', 1, 1, '1 Main', 'Jane', '+19135551212', null,
              1, '2026-05-01T14:30:00.000Z', null, 'accepted',
              '2026-04-17T00:00:00.000Z', '2026-04-17T00:00:00.000Z');
  `);
  return sqlite;
}

describe('GET /c/<token>', () => {
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
