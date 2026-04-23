import { describe, it, expect } from 'vitest';
import * as schema from '@/db/schema';
import { admins } from '@/db/schema/admins';
import { createTestDb } from '@/db/test-helpers';
import { adminsTableEmpty, foundFirstAdmin } from './found-core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

describe('adminsTableEmpty', () => {
  it('returns true when the table is empty', () => {
    const { db, cleanup } = createTestDb({ inMemory: true });
    expect(adminsTableEmpty(db as Parameters<typeof foundFirstAdmin>[1])).toBe(true);
    cleanup();
  });

  it('returns false when at least one row exists', () => {
    const { db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as BetterSQLite3Database<typeof schema>;
    typedDb.insert(admins)
      .values({
        name: 'Alice',
        active: 1,
        enrolledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .run();
    expect(adminsTableEmpty(typedDb as Parameters<typeof foundFirstAdmin>[1])).toBe(false);
    cleanup();
  });
});

describe('foundFirstAdmin', () => {
  it('succeeds when admins table is empty', () => {
    const { sqlite, db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as Parameters<typeof foundFirstAdmin>[1];
    const res = foundFirstAdmin(sqlite, typedDb, { name: 'Founder' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.adminId).toBeGreaterThan(0);
    }
    const rows = (db as BetterSQLite3Database<typeof schema>).select().from(admins).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Founder');
    expect(rows[0].active).toBe(1);
    expect(rows[0].enrolledAt).not.toBeNull();
    cleanup();
  });

  it('fails when admins table is non-empty (canonical failure shape)', () => {
    const { sqlite, db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as Parameters<typeof foundFirstAdmin>[1];
    (db as BetterSQLite3Database<typeof schema>).insert(admins)
      .values({
        name: 'First',
        active: 1,
        enrolledAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .run();

    const res = foundFirstAdmin(sqlite, typedDb, { name: 'Second' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('admins_not_empty');
    }

    const rows = (db as BetterSQLite3Database<typeof schema>).select().from(admins).all();
    // Table must contain exactly the pre-existing admin.
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('First');
    cleanup();
  });

  it('lowercases + trims the email when persisting', () => {
    const { sqlite, db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as Parameters<typeof foundFirstAdmin>[1];
    const res = foundFirstAdmin(sqlite, typedDb, {
      name: 'Founder',
      email: '  FOUNDER@Example.COM ',
    });
    expect(res.ok).toBe(true);
    const rows = (db as BetterSQLite3Database<typeof schema>).select().from(admins).all();
    expect(rows[0].email).toBe('founder@example.com');
    cleanup();
  });

  it('leaves email NULL when not provided (legacy single-admin path)', () => {
    const { sqlite, db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as Parameters<typeof foundFirstAdmin>[1];
    const res = foundFirstAdmin(sqlite, typedDb, { name: 'NoEmail' });
    expect(res.ok).toBe(true);
    const rows = (db as BetterSQLite3Database<typeof schema>).select().from(admins).all();
    expect(rows[0].email).toBeNull();
    cleanup();
  });

  it('persists credential + recovery code when provided', () => {
    const { sqlite, db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as Parameters<typeof foundFirstAdmin>[1];
    const res = foundFirstAdmin(sqlite, typedDb, {
      name: 'Founder',
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
    cleanup();
  });

  it('serializes concurrent calls — exactly one wins', () => {
    const { sqlite, db, cleanup } = createTestDb({ inMemory: true });
    const typedDb = db as Parameters<typeof foundFirstAdmin>[1];

    // Simulate "simultaneous" by calling twice synchronously. SQLite
    // transactions are serializable on the connection — the second tx sees
    // the admin row the first one inserted and fails the count guard.
    const first = foundFirstAdmin(sqlite, typedDb, { name: 'Winner' });
    const second = foundFirstAdmin(sqlite, typedDb, { name: 'Loser' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);

    const rows = (db as BetterSQLite3Database<typeof schema>).select().from(admins).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Winner');
    cleanup();
  });
});
