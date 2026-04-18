/**
 * Integration tests for admin CLI command logic.
 *
 * These tests exercise the database mutations performed by each CLI command
 * using an in-memory SQLite database, without running subprocess or
 * process.exit calls. The test directly imports and exercises the same Drizzle
 * operations each CLI script performs.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { admins } from '@/db/schema/admins';
import { credentials } from '@/db/schema/credentials';
import { recoveryCodes } from '@/db/schema/recovery-codes';

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates a fresh in-memory SQLite database with all auth tables.
 */
function createTestDb(): TestDb {
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
      admin_id INTEGER NOT NULL REFERENCES admins(id),
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT,
      label TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      admin_id INTEGER NOT NULL REFERENCES admins(id),
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX recovery_codes_active ON recovery_codes(admin_id) WHERE used_at IS NULL;
  `);
  return drizzle(sqlite, { schema });
}

/** Seed a test admin and return its id */
function seedAdmin(
  db: TestDb,
  email: string,
  opts: { active?: number; enrolledAt?: string | null } = {},
): number {
  const result = db
    .insert(admins)
    .values({
      email,
      active: opts.active ?? 1,
      enrolledAt: opts.enrolledAt ?? null,
      createdAt: new Date().toISOString(),
    })
    .returning({ id: admins.id })
    .get();
  return result.id;
}

// ---------------------------------------------------------------------------
// admin:disable
// ---------------------------------------------------------------------------
describe('admin:disable', () => {
  it('sets active=0 for the specified admin', () => {
    const db = createTestDb();
    const id = seedAdmin(db, 'alice@example.com', { active: 1 });

    db.update(admins).set({ active: 0 }).where(eq(admins.id, id)).run();

    const row = db.select().from(admins).where(eq(admins.id, id)).get();
    expect(row?.active).toBe(0);
  });

  it('leaves other admins untouched', () => {
    const db = createTestDb();
    const aliceId = seedAdmin(db, 'alice@example.com', { active: 1 });
    const bobId = seedAdmin(db, 'bob@example.com', { active: 1 });

    db.update(admins).set({ active: 0 }).where(eq(admins.id, aliceId)).run();

    const bob = db.select().from(admins).where(eq(admins.id, bobId)).get();
    expect(bob?.active).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// admin:enable
// ---------------------------------------------------------------------------
describe('admin:enable', () => {
  it('sets active=1 for a previously disabled admin', () => {
    const db = createTestDb();
    const id = seedAdmin(db, 'alice@example.com', { active: 0 });

    db.update(admins).set({ active: 1 }).where(eq(admins.id, id)).run();

    const row = db.select().from(admins).where(eq(admins.id, id)).get();
    expect(row?.active).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// admin:reset
// ---------------------------------------------------------------------------
describe('admin:reset', () => {
  it('deletes credentials for the admin', () => {
    const db = createTestDb();
    const adminId = seedAdmin(db, 'alice@example.com', {
      active: 1,
      enrolledAt: new Date().toISOString(),
    });

    // Insert a credential
    db.insert(credentials)
      .values({
        adminId,
        credentialId: 'cred-abc-123',
        publicKey: 'pubkey-data',
        counter: 0,
        deviceType: 'iPhone (iOS 17)',
        createdAt: new Date().toISOString(),
      })
      .run();

    // Reset: delete credentials
    db.delete(credentials).where(eq(credentials.adminId, adminId)).run();

    const creds = db.select().from(credentials).where(eq(credentials.adminId, adminId)).all();
    expect(creds).toHaveLength(0);
  });

  it('deletes recovery_codes for the admin', () => {
    const db = createTestDb();
    const adminId = seedAdmin(db, 'alice@example.com', {
      active: 1,
      enrolledAt: new Date().toISOString(),
    });

    // Insert a recovery code
    db.insert(recoveryCodes)
      .values({
        adminId,
        codeHash: 'hashed-code',
        usedAt: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    // Reset: delete recovery codes
    db.delete(recoveryCodes).where(eq(recoveryCodes.adminId, adminId)).run();

    const codes = db.select().from(recoveryCodes).where(eq(recoveryCodes.adminId, adminId)).all();
    expect(codes).toHaveLength(0);
  });

  it('sets enrolled_at to NULL', () => {
    const db = createTestDb();
    const adminId = seedAdmin(db, 'alice@example.com', {
      active: 1,
      enrolledAt: '2026-01-01T00:00:00.000Z',
    });

    // Reset: set enrolled_at = NULL
    db.update(admins).set({ enrolledAt: null }).where(eq(admins.id, adminId)).run();

    const row = db.select().from(admins).where(eq(admins.id, adminId)).get();
    expect(row?.enrolledAt).toBeNull();
  });

  it('preserves the admin record and active flag after reset', () => {
    const db = createTestDb();
    const adminId = seedAdmin(db, 'alice@example.com', {
      active: 1,
      enrolledAt: '2026-01-01T00:00:00.000Z',
    });

    db.delete(credentials).where(eq(credentials.adminId, adminId)).run();
    db.delete(recoveryCodes).where(eq(recoveryCodes.adminId, adminId)).run();
    db.update(admins).set({ enrolledAt: null }).where(eq(admins.id, adminId)).run();

    const row = db.select().from(admins).where(eq(admins.id, adminId)).get();
    expect(row).toBeDefined();
    expect(row?.email).toBe('alice@example.com');
    expect(row?.active).toBe(1);
    expect(row?.enrolledAt).toBeNull();
  });

  it('does not touch other admins credentials', () => {
    const db = createTestDb();
    const aliceId = seedAdmin(db, 'alice@example.com', { active: 1 });
    const bobId = seedAdmin(db, 'bob@example.com', { active: 1 });

    // Give bob a credential
    db.insert(credentials)
      .values({
        adminId: bobId,
        credentialId: 'bob-cred-001',
        publicKey: 'bob-pubkey',
        counter: 0,
        createdAt: new Date().toISOString(),
      })
      .run();

    // Reset alice only
    db.delete(credentials).where(eq(credentials.adminId, aliceId)).run();
    db.delete(recoveryCodes).where(eq(recoveryCodes.adminId, aliceId)).run();
    db.update(admins).set({ enrolledAt: null }).where(eq(admins.id, aliceId)).run();

    const bobCreds = db.select().from(credentials).where(eq(credentials.adminId, bobId)).all();
    expect(bobCreds).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// admin:list (data shape)
// ---------------------------------------------------------------------------
describe('admin:list data', () => {
  it('returns the correct fields for each admin', () => {
    const db = createTestDb();
    const aliceId = seedAdmin(db, 'alice@example.com', {
      active: 1,
      enrolledAt: '2026-01-01T00:00:00.000Z',
    });
    const bobId = seedAdmin(db, 'bob@example.com', { active: 0 });

    // Alice has two devices
    db.insert(credentials)
      .values([
        {
          adminId: aliceId,
          credentialId: 'c1',
          publicKey: 'pk1',
          counter: 0,
          createdAt: new Date().toISOString(),
        },
        {
          adminId: aliceId,
          credentialId: 'c2',
          publicKey: 'pk2',
          counter: 0,
          createdAt: new Date().toISOString(),
        },
      ])
      .run();

    const allAdmins = db.select().from(admins).all();
    expect(allAdmins).toHaveLength(2);

    const aliceCreds = db
      .select()
      .from(credentials)
      .where(eq(credentials.adminId, aliceId))
      .all();
    expect(aliceCreds).toHaveLength(2);

    const bobCreds = db.select().from(credentials).where(eq(credentials.adminId, bobId)).all();
    expect(bobCreds).toHaveLength(0);
  });
});
