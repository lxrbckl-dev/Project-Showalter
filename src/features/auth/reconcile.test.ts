import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { admins } from '@/db/schema/admins';
import { reconcileAdmins } from './reconcile';

/**
 * Creates a fresh in-memory SQLite database with the auth tables.
 */
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
  `);
  return drizzle(sqlite, { schema }) as Parameters<typeof reconcileAdmins>[0];
}

describe('reconcileAdmins', () => {
  it('inserts new emails that are not in DB', async () => {
    const db = createTestDb();
    const result = await reconcileAdmins(db, ['alice@example.com', 'bob@example.com']);

    expect(result.added).toEqual(['alice@example.com', 'bob@example.com']);
    expect(result.disabled).toEqual([]);
    expect(result.unchanged).toEqual([]);

    const rows = db.select().from(admins).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.active === 1)).toBe(true);
    expect(rows.every((r) => r.enrolledAt === null)).toBe(true);
  });

  it('soft-disables emails in DB that are not in the new list', async () => {
    const db = createTestDb();

    // Pre-seed two admins
    db.insert(admins)
      .values([
        { email: 'alice@example.com', active: 1, createdAt: new Date().toISOString() },
        { email: 'bob@example.com', active: 1, createdAt: new Date().toISOString() },
      ])
      .run();

    // Only alice is in the new list
    const result = await reconcileAdmins(db, ['alice@example.com']);

    expect(result.added).toEqual([]);
    expect(result.disabled).toEqual(['bob@example.com']);
    expect(result.unchanged).toEqual(['alice@example.com']);

    const rows = db.select().from(admins).all();
    const alice = rows.find((r) => r.email === 'alice@example.com');
    const bob = rows.find((r) => r.email === 'bob@example.com');
    expect(alice?.active).toBe(1);
    expect(bob?.active).toBe(0);
  });

  it('leaves unchanged emails that are in both DB and list', async () => {
    const db = createTestDb();

    db.insert(admins)
      .values([
        { email: 'alice@example.com', active: 1, createdAt: new Date().toISOString() },
        { email: 'bob@example.com', active: 1, createdAt: new Date().toISOString() },
      ])
      .run();

    const result = await reconcileAdmins(db, ['alice@example.com', 'bob@example.com']);

    expect(result.added).toEqual([]);
    expect(result.disabled).toEqual([]);
    expect(result.unchanged).toContain('alice@example.com');
    expect(result.unchanged).toContain('bob@example.com');

    const rows = db.select().from(admins).all();
    expect(rows.every((r) => r.active === 1)).toBe(true);
  });

  it('returns empty result and does not mutate DB when list is empty', async () => {
    const db = createTestDb();

    db.insert(admins)
      .values({ email: 'alice@example.com', active: 1, createdAt: new Date().toISOString() })
      .run();

    const result = await reconcileAdmins(db, []);

    expect(result.added).toEqual([]);
    expect(result.disabled).toEqual([]);
    expect(result.unchanged).toEqual([]);

    // DB should be untouched
    const rows = db.select().from(admins).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(1);
  });

  it('handles mixed scenario: new + removed + shared', async () => {
    const db = createTestDb();

    // Pre-seed alice and bob
    db.insert(admins)
      .values([
        { email: 'alice@example.com', active: 1, createdAt: new Date().toISOString() },
        { email: 'bob@example.com', active: 1, createdAt: new Date().toISOString() },
      ])
      .run();

    // New list: alice (shared) + carol (new); bob removed
    const result = await reconcileAdmins(db, ['alice@example.com', 'carol@example.com']);

    expect(result.added).toEqual(['carol@example.com']);
    expect(result.disabled).toEqual(['bob@example.com']);
    expect(result.unchanged).toEqual(['alice@example.com']);

    const rows = db.select().from(admins).all();
    expect(rows).toHaveLength(3);

    const byEmail = Object.fromEntries(rows.map((r) => [r.email, r]));
    expect(byEmail['alice@example.com'].active).toBe(1);
    expect(byEmail['bob@example.com'].active).toBe(0);
    expect(byEmail['carol@example.com'].active).toBe(1);
  });
});
