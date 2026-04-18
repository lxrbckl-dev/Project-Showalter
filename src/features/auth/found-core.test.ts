import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { admins } from '@/db/schema/admins';
import { adminsTableEmpty, foundFirstAdmin } from './found-core';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      enrolled_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      admin_id INTEGER NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT,
      label TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      admin_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const db = drizzle(sqlite, { schema }) as Parameters<typeof foundFirstAdmin>[1];
  return { sqlite, db };
}

describe('adminsTableEmpty', () => {
  it('returns true when the table is empty', () => {
    const { db } = createTestDb();
    expect(adminsTableEmpty(db)).toBe(true);
  });

  it('returns false when at least one row exists', () => {
    const { db } = createTestDb();
    db.insert(admins)
      .values({
        email: 'alice@example.com',
        active: 1,
        enrolledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .run();
    expect(adminsTableEmpty(db)).toBe(false);
  });
});

describe('foundFirstAdmin', () => {
  it('succeeds when admins table is empty', () => {
    const { sqlite, db } = createTestDb();
    const res = foundFirstAdmin(sqlite, db, { email: 'FOUNDER@EXAMPLE.com' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.adminId).toBeGreaterThan(0);
    }
    const rows = db.select().from(admins).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('founder@example.com');
    expect(rows[0].active).toBe(1);
    expect(rows[0].enrolledAt).not.toBeNull();
  });

  it('fails when admins table is non-empty (canonical failure shape)', () => {
    const { sqlite, db } = createTestDb();
    db.insert(admins)
      .values({
        email: 'first@example.com',
        active: 1,
        enrolledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = foundFirstAdmin(sqlite, db, { email: 'second@example.com' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('admins_not_empty');
    }

    const rows = db.select().from(admins).all();
    // Table must contain exactly the pre-existing admin.
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('first@example.com');
  });

  it('persists credential + recovery code when provided', () => {
    const { sqlite, db } = createTestDb();
    const res = foundFirstAdmin(sqlite, db, {
      email: 'founder@example.com',
      credential: {
        credentialId: 'cred-abc',
        publicKeyB64: 'Zm9v',
        counter: 0,
        deviceType: 'singleDevice',
      },
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(true);

    const credRow = sqlite.prepare('SELECT * FROM credentials').get();
    expect(credRow).toBeTruthy();

    const recovery = sqlite.prepare('SELECT * FROM recovery_codes').get();
    expect(recovery).toBeTruthy();
  });

  it('serializes concurrent calls — exactly one wins', async () => {
    const { sqlite, db } = createTestDb();

    // Simulate "simultaneous" by calling twice synchronously. SQLite
    // transactions are serializable on the connection — the second tx sees
    // the admin row the first one inserted and fails the count guard.
    const first = foundFirstAdmin(sqlite, db, { email: 'winner@example.com' });
    const second = foundFirstAdmin(sqlite, db, { email: 'loser@example.com' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);

    const rows = db.select().from(admins).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('winner@example.com');
  });

  it('fails via UNIQUE email constraint if same email races itself', () => {
    const { sqlite, db } = createTestDb();

    // Manually insert a row to simulate "another writer got there first."
    db.insert(admins)
      .values({
        email: 'same@example.com',
        active: 1,
        enrolledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = foundFirstAdmin(sqlite, db, { email: 'same@example.com' });
    expect(res.ok).toBe(false);

    const rows = db.select().from(admins).all();
    expect(rows).toHaveLength(1);
  });
});
