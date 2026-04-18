/**
 * Unit tests for the devices feature (issue #77).
 *
 * These exercise the core security guards:
 *   - Last-device guard (removeDevice rejects when count === 1)
 *   - Session cleanup on remove (sessions tied to the revoked credential
 *     are deleted so a stolen device's cookie is invalidated)
 *   - startAddDevice populates excludeCredentials with existing IDs
 *   - finishAddDevice persists with the correct admin_id + optional label
 *   - Cross-admin authorization (admin A cannot touch admin B's credentials)
 *   - Current-device guard (the API also rejects removing the session's
 *     own credential, independent of the UI hiding the button)
 *   - Label length validation
 *
 * The tests mock `auth` and `getDb` because the real `auth()` reads from
 * Next.js's cookie store and isn't available outside a request context.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { admins, credentials, sessions, users } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// The devices module's `'use server'` directive + the auth module's cookie
// reads mean we have to stub before import. Set up shared state first.
let currentSession: {
  user: { id: string; email: string; name?: string | null };
  credentialId: string | null;
  expires: Date;
} | null = null;
let sharedDb: DrizzleDb | null = null;

vi.mock('./auth', () => ({
  auth: async () => currentSession,
  signIn: async () => ({ ok: true }),
  signOut: async () => ({ ok: true }),
}));

vi.mock('@/db', () => ({
  getDb: () => sharedDb,
  getSqlite: () => {
    throw new Error('getSqlite not mocked');
  },
}));

// Stub the WebAuthn verification seam so finishAddDevice tests can feed a
// crafted success/failure without generating a real attestation. The
// generateRegistrationOptions path is left real — startAddDevice returns
// whatever the real function produces, which is fine for our assertions
// (we only inspect excludeCredentials).
let mockVerifyResult:
  | { verified: true; registrationInfo: { credential: { id: string; publicKey: Uint8Array; counter: number }; credentialDeviceType: string } }
  | { verified: false }
  | null = null;

vi.mock('@simplewebauthn/server', async () => {
  const actual = await vi.importActual<typeof import('@simplewebauthn/server')>(
    '@simplewebauthn/server',
  );
  return {
    ...actual,
    verifyRegistrationResponse: async () => {
      if (!mockVerifyResult) {
        throw new Error('mockVerifyResult not set for this test');
      }
      return mockVerifyResult as unknown as Awaited<
        ReturnType<typeof actual.verifyRegistrationResponse>
      >;
    },
  };
});

// Import AFTER the mocks are installed.
import {
  finishAddDevice,
  listMyDevices,
  removeDevice,
  renameDevice,
  startAddDevice,
} from './devices';
import { __resetChallenges, saveChallenge } from './challenges';

function createTestDb(): DrizzleDb {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  // Mirror the schema shape from migrations 0001 + 0003 + 0011.
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
    CREATE TABLE user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      email TEXT UNIQUE,
      emailVerified INTEGER,
      image TEXT
    );
    CREATE TABLE session (
      sessionToken TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL,
      credentialId TEXT
    );
  `);
  return drizzle(sqlite, { schema });
}

function seedAdmin(db: DrizzleDb, email: string, opts?: { enrolled?: boolean }): number {
  const enrolled = opts?.enrolled ?? true;
  db.insert(admins)
    .values({
      email,
      active: 1,
      enrolledAt: enrolled ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    })
    .run();
  const found = db
    .select()
    .from(admins)
    .all()
    .find((a) => a.email === email);
  if (!found) throw new Error(`seed failed for ${email}`);
  return found.id;
}

function seedCredential(
  db: DrizzleDb,
  adminId: number,
  credentialId: string,
  opts?: { label?: string | null; createdAt?: string },
): void {
  db.insert(credentials)
    .values({
      adminId,
      credentialId,
      publicKey: 'fake-pk',
      counter: 0,
      deviceType: 'platform',
      label: opts?.label ?? null,
      createdAt: opts?.createdAt ?? new Date().toISOString(),
    })
    .run();
}

function seedSession(
  db: DrizzleDb,
  token: string,
  email: string,
  credentialId: string | null,
): void {
  const userId = crypto.randomUUID();
  db.insert(users).values({ id: userId, email, name: email }).run();
  db.insert(sessions)
    .values({
      sessionToken: token,
      userId,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      credentialId,
    })
    .run();
}

beforeEach(() => {
  sharedDb = createTestDb();
  currentSession = null;
  mockVerifyResult = null;
  __resetChallenges();
  process.env.BASE_URL = 'http://localhost:3000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listMyDevices', () => {
  it('returns empty when unauthenticated', async () => {
    const list = await listMyDevices();
    expect(list).toEqual([]);
  });

  it('returns only the current admin’s devices, newest first, with isThisDevice flag', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    const bobId = seedAdmin(db, 'bob@test.com');
    seedCredential(db, aliceId, 'alice-cred-1', {
      label: 'iPhone',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedCredential(db, aliceId, 'alice-cred-2', {
      label: 'Laptop',
      createdAt: '2026-04-01T00:00:00.000Z',
    });
    seedCredential(db, bobId, 'bob-cred-1', {
      createdAt: '2026-02-01T00:00:00.000Z',
    });

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred-1',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const list = await listMyDevices();
    expect(list.map((d) => d.credentialId)).toEqual(['alice-cred-2', 'alice-cred-1']);
    expect(list.find((d) => d.credentialId === 'alice-cred-1')?.isThisDevice).toBe(true);
    expect(list.find((d) => d.credentialId === 'alice-cred-2')?.isThisDevice).toBe(false);
    // Bob's credential is NOT visible to Alice.
    expect(list.some((d) => d.credentialId === 'bob-cred-1')).toBe(false);
  });
});

describe('startAddDevice', () => {
  it('rejects unauthenticated callers', async () => {
    const res = await startAddDevice();
    expect(res.ok).toBe(false);
  });

  it('populates excludeCredentials with every existing credentialId owned by the admin', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    seedCredential(db, aliceId, 'alice-cred-1');
    seedCredential(db, aliceId, 'alice-cred-2');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred-1',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await startAddDevice();
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('typeguard');
    const excluded = (res.options.excludeCredentials ?? []).map(
      (c: { id: string }) => c.id,
    );
    expect(excluded).toContain('alice-cred-1');
    expect(excluded).toContain('alice-cred-2');
    expect(excluded).toHaveLength(2);
  });
});

describe('finishAddDevice', () => {
  it('inserts the new credential under the current admin with the optional label', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: null,
      expires: new Date(Date.now() + 1000 * 60),
    };

    // Short-circuit WebAuthn verification to return a crafted success.
    const fakeCredId = 'new-cred-id-xyz';
    mockVerifyResult = {
      verified: true,
      registrationInfo: {
        credential: {
          id: fakeCredId,
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        credentialDeviceType: 'singleDevice',
      },
    };

    // Stash a challenge as if startAddDevice had run.
    saveChallenge('addDevice', 'alice@test.com', 'fake-challenge');

    const res = await finishAddDevice(
      {
        id: fakeCredId,
        rawId: fakeCredId,
        response: {} as unknown as Parameters<typeof finishAddDevice>[0]['response'],
        type: 'public-key',
        clientExtensionResults: {},
      } as Parameters<typeof finishAddDevice>[0],
      'My iPhone',
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('typeguard');
    expect(res.credentialId).toBe(fakeCredId);

    const rows = db.select().from(credentials).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe(aliceId);
    expect(rows[0].credentialId).toBe(fakeCredId);
    expect(rows[0].label).toBe('My iPhone');
  });

  it('rejects labels longer than 50 characters', async () => {
    const db = sharedDb!;
    seedAdmin(db, 'alice@test.com');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: null,
      expires: new Date(Date.now() + 1000 * 60),
    };

    saveChallenge('addDevice', 'alice@test.com', 'fake-challenge');

    const res = await finishAddDevice(
      {
        id: 'x',
        rawId: 'x',
        response: {} as unknown as Parameters<typeof finishAddDevice>[0]['response'],
        type: 'public-key',
        clientExtensionResults: {},
      } as Parameters<typeof finishAddDevice>[0],
      'x'.repeat(51),
    );
    expect(res.ok).toBe(false);
  });
});

describe('removeDevice', () => {
  it('rejects when the target is the admin’s last credential', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    seedCredential(db, aliceId, 'alice-only-cred');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'some-other-session-cred',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await removeDevice('alice-only-cred');
    expect(res).toEqual({ ok: false, reason: 'last_device' });

    // Still there.
    const rows = db.select().from(credentials).all();
    expect(rows).toHaveLength(1);
  });

  it('rejects when the target is the current session’s credential (is_current_device)', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    seedCredential(db, aliceId, 'alice-cred-current');
    seedCredential(db, aliceId, 'alice-cred-other');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred-current',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await removeDevice('alice-cred-current');
    expect(res).toEqual({ ok: false, reason: 'is_current_device' });
    expect(db.select().from(credentials).all()).toHaveLength(2);
  });

  it('rejects when admin A tries to remove admin B’s credential (cross-admin authorization)', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    const bobId = seedAdmin(db, 'bob@test.com');
    seedCredential(db, aliceId, 'alice-cred');
    seedCredential(db, bobId, 'bob-cred-1');
    seedCredential(db, bobId, 'bob-cred-2');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await removeDevice('bob-cred-1');
    expect(res).toEqual({ ok: false, reason: 'not_found' });

    // Bob's credentials are untouched.
    const bobRows = db.select().from(credentials).all().filter((r) => r.adminId === bobId);
    expect(bobRows).toHaveLength(2);
  });

  it('deletes the credential + every session row tied to it on success', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    seedCredential(db, aliceId, 'alice-cred-current');
    seedCredential(db, aliceId, 'alice-cred-lost-phone');

    // Two sessions, one per credential, plus a stray.
    seedSession(db, 'current-tok', 'alice+a@test.com', 'alice-cred-current');
    seedSession(db, 'lost-phone-tok', 'alice+b@test.com', 'alice-cred-lost-phone');
    seedSession(db, 'other-lost-tok', 'alice+c@test.com', 'alice-cred-lost-phone');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred-current',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await removeDevice('alice-cred-lost-phone');
    expect(res).toEqual({ ok: true });

    const remainingCreds = db.select().from(credentials).all();
    expect(remainingCreds.map((c) => c.credentialId)).toEqual(['alice-cred-current']);

    const remainingSessions = db.select().from(sessions).all();
    expect(remainingSessions.map((s) => s.sessionToken)).toEqual(['current-tok']);
  });

  it('rejects unauthenticated callers', async () => {
    const res = await removeDevice('any');
    expect(res.ok).toBe(false);
  });
});

describe('renameDevice', () => {
  it('rejects cross-admin renames', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    const bobId = seedAdmin(db, 'bob@test.com');
    seedCredential(db, aliceId, 'alice-cred');
    seedCredential(db, bobId, 'bob-cred');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await renameDevice('bob-cred', 'hijack');
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('typeguard');
    expect(res.reason).toBe('not_found');

    const bob = db.select().from(credentials).all().find((r) => r.adminId === bobId);
    expect(bob?.label).toBeNull();
  });

  it('rejects labels longer than 50 chars', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    seedCredential(db, aliceId, 'alice-cred');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await renameDevice('alice-cred', 'x'.repeat(51));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('typeguard');
    expect(res.reason).toBe('invalid_label');
  });

  it('updates the label on success', async () => {
    const db = sharedDb!;
    const aliceId = seedAdmin(db, 'alice@test.com');
    seedCredential(db, aliceId, 'alice-cred');

    currentSession = {
      user: { id: 'user-alice', email: 'alice@test.com' },
      credentialId: 'alice-cred',
      expires: new Date(Date.now() + 1000 * 60),
    };

    const res = await renameDevice('alice-cred', 'My Laptop');
    expect(res.ok).toBe(true);
    const row = db
      .select()
      .from(credentials)
      .all()
      .find((r) => r.credentialId === 'alice-cred');
    expect(row?.label).toBe('My Laptop');
  });
});
