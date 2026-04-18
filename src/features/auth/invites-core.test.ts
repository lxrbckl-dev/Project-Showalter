import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { admins, adminInvites } from '@/db/schema';
import {
  INVITE_TOKEN_PREFIX_MIN,
  acceptInvite,
  createInvite,
  findInviteByTokenPrefix,
  listInvites,
  revokeInviteByToken,
  validateInvite,
} from './invites-core';
import { INVITE_TTL_MS, deriveStatus } from './invites-shared';

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
    CREATE TABLE admin_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      invited_email TEXT NOT NULL,
      label TEXT,
      created_by_admin_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by_admin_id INTEGER,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const db = drizzle(sqlite, { schema }) as Parameters<typeof createInvite>[0];

  const now = new Date('2026-04-17T12:00:00Z').toISOString();
  db.insert(admins)
    .values({ email: 'founder@example.com', active: 1, enrolledAt: now, createdAt: now })
    .run();
  const founder = db.select().from(admins).all()[0]!;

  return { sqlite, db, founder };
}

const cred = {
  credentialId: 'cred-xyz',
  publicKeyB64: 'Zm9v',
  counter: 0,
  deviceType: 'singleDevice' as string | null,
};

describe('createInvite', () => {
  it('lowercases + trims email, sets expires_at = created_at + 24h', () => {
    const { db, founder } = createTestDb();
    const now = new Date('2026-04-17T12:00:00Z');
    const row = createInvite(db, {
      invitedEmail: '  New@Invitee.COM  ',
      label: '  Mom  ',
      createdByAdminId: founder.id,
      now,
    });

    expect(row.invitedEmail).toBe('new@invitee.com');
    expect(row.label).toBe('Mom');
    expect(row.createdAt).toBe(now.toISOString());

    const expectedExpiry = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
    expect(row.expiresAt).toBe(expectedExpiry);

    const elapsed =
      new Date(row.expiresAt).getTime() - new Date(row.createdAt).getTime();
    expect(Math.abs(elapsed - INVITE_TTL_MS)).toBeLessThan(1_000);
  });

  it('stores null label when empty string supplied', () => {
    const { db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'a@b.com',
      label: '   ',
      createdByAdminId: founder.id,
    });
    expect(row.label).toBeNull();
  });
});

describe('deriveStatus', () => {
  const base = {
    expiresAt: '2099-01-01T00:00:00Z',
    usedAt: null as string | null,
    revokedAt: null as string | null,
  };

  it('returns pending when not revoked, used, or expired', () => {
    expect(deriveStatus(base, '2026-04-17T00:00:00Z')).toBe('pending');
  });

  it('returns revoked when revokedAt is set (overrides used + expired)', () => {
    expect(
      deriveStatus(
        { ...base, revokedAt: '2026-04-17T00:00:00Z', usedAt: '2026-04-01T00:00:00Z' },
        '2026-04-17T00:00:00Z',
      ),
    ).toBe('revoked');
  });

  it('returns used when usedAt is set and not revoked', () => {
    expect(
      deriveStatus(
        { ...base, usedAt: '2026-04-17T00:00:00Z' },
        '2026-04-17T00:00:00Z',
      ),
    ).toBe('used');
  });

  it('returns expired when expires_at is in the past and not used/revoked', () => {
    expect(
      deriveStatus(
        { ...base, expiresAt: '2020-01-01T00:00:00Z' },
        '2026-04-17T00:00:00Z',
      ),
    ).toBe('expired');
  });

  it('still returns used if usedAt is set and expires_at is in the past', () => {
    expect(
      deriveStatus(
        { expiresAt: '2020-01-01T00:00:00Z', usedAt: '2020-01-01T01:00:00Z', revokedAt: null },
        '2026-04-17T00:00:00Z',
      ),
    ).toBe('used');
  });
});

describe('validateInvite', () => {
  it('rejects unknown tokens', () => {
    const { db } = createTestDb();
    const res = validateInvite(db, 'missing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe('unknown');
  });

  it('rejects expired', () => {
    const { db, founder } = createTestDb();
    const longAgo = new Date('2020-01-01T00:00:00Z');
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
      now: longAgo,
    });
    const res = validateInvite(db, row.token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe('expired');
  });

  it('rejects revoked', () => {
    const { db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db, row.token);
    const res = validateInvite(db, row.token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe('revoked');
  });

  it('accepts a fresh invite', () => {
    const { db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    const res = validateInvite(db, row.token);
    expect(res.ok).toBe(true);
  });
});

describe('acceptInvite', () => {
  it('happy path inserts admin + credential + recovery code + marks invite used', () => {
    const { sqlite, db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'invitee@example.com',
      label: null,
      createdByAdminId: founder.id,
    });

    const res = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'invitee@example.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.email).toBe('invitee@example.com');
      expect(res.adminId).toBeGreaterThan(0);
    }

    const admins2 = db.select().from(admins).all();
    // founder + new admin
    expect(admins2.length).toBe(2);

    const updated = db.select().from(adminInvites).all()[0];
    expect(updated?.usedAt).not.toBeNull();
    expect(updated?.usedByAdminId).toBeTruthy();
  });

  it('rejects mismatched email (case-insensitive compare)', () => {
    const { sqlite, db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'a@b.com',
      label: null,
      createdByAdminId: founder.id,
    });

    const res = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'c@d.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(false);

    const admins2 = db.select().from(admins).all();
    expect(admins2.length).toBe(1); // only founder
    const inviteRow = db.select().from(adminInvites).all()[0];
    expect(inviteRow?.usedAt).toBeNull();
  });

  it('accepts when case differs (lowercased match)', () => {
    const { sqlite, db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'Mixed@Case.com',
      label: null,
      createdByAdminId: founder.id,
    });
    // createInvite lowercased the stored invited_email, so submitting
    // the mixed-case form succeeds.
    const res = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'MIXED@case.COM',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.email).toBe('mixed@case.com');
  });

  it('rejects an expired invite', () => {
    const { sqlite, db, founder } = createTestDb();
    const longAgo = new Date('2020-01-01T00:00:00Z');
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
      now: longAgo,
    });
    const res = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a revoked invite', () => {
    const { sqlite, db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db, row.token);
    const res = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a used invite (second accept fails)', () => {
    const { sqlite, db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });

    const first = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(first.ok).toBe(true);

    const second = acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: { ...cred, credentialId: 'cred-different' },
      hashedRecoveryCode: 'hashed2',
    });
    expect(second.ok).toBe(false);

    const admins2 = db.select().from(admins).all();
    expect(admins2.length).toBe(2); // founder + first-accept only
  });
});

describe('revokeInviteByToken', () => {
  it('sets revokedAt on a pending invite', () => {
    const { db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    const res = revokeInviteByToken(db, row.token);
    expect(res.ok).toBe(true);

    const updated = db.select().from(adminInvites).all()[0];
    expect(updated?.revokedAt).not.toBeNull();
  });

  it('is idempotent on an already-revoked invite', () => {
    const { db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db, row.token);
    const res = revokeInviteByToken(db, row.token);
    expect(res.ok).toBe(true);
  });

  it('refuses to revoke a used invite', () => {
    const { sqlite, db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    acceptInvite(sqlite, db, {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    const res = revokeInviteByToken(db, row.token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('already_terminal');
  });
});

describe('listInvites', () => {
  it('returns derived status for each invite', () => {
    const { sqlite, db, founder } = createTestDb();
    const longAgo = new Date('2020-01-01T00:00:00Z');

    const pending = createInvite(db, {
      invitedEmail: 'pending@example.com',
      label: 'Pending',
      createdByAdminId: founder.id,
    });
    createInvite(db, {
      invitedEmail: 'expired@example.com',
      label: null,
      createdByAdminId: founder.id,
      now: longAgo,
    });
    const revoked = createInvite(db, {
      invitedEmail: 'revoked@example.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db, revoked.token);

    const used = createInvite(db, {
      invitedEmail: 'used@example.com',
      label: null,
      createdByAdminId: founder.id,
    });
    acceptInvite(sqlite, db, {
      token: used.token,
      submittedEmail: 'used@example.com',
      credential: cred,
      hashedRecoveryCode: 'h',
    });

    const views = listInvites(db);
    const byEmail = Object.fromEntries(views.map((v) => [v.invitedEmail, v.status]));
    expect(byEmail['pending@example.com']).toBe('pending');
    expect(byEmail['expired@example.com']).toBe('expired');
    expect(byEmail['revoked@example.com']).toBe('revoked');
    expect(byEmail['used@example.com']).toBe('used');

    // usedByEmail resolves
    const usedView = views.find((v) => v.invitedEmail === 'used@example.com');
    expect(usedView?.usedByEmail).toBe('used@example.com');
    // createdByEmail resolves to founder
    expect(
      views.every((v) => v.createdByEmail === 'founder@example.com'),
    ).toBe(true);

    // Silence unused
    void pending;
  });
});

describe('findInviteByTokenPrefix', () => {
  it('rejects short prefixes', () => {
    const { db } = createTestDb();
    const res = findInviteByTokenPrefix(db, 'x'.repeat(INVITE_TOKEN_PREFIX_MIN - 1));
    expect(res.kind).toBe('none');
  });

  it('matches exactly one when unique', () => {
    const { db, founder } = createTestDb();
    const row = createInvite(db, {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
      token: 'abcdef0123-unique',
    });
    const res = findInviteByTokenPrefix(db, 'abcdef0');
    expect(res.kind).toBe('one');
    if (res.kind === 'one') expect(res.row.token).toBe(row.token);
  });

  it('returns ambiguous when multiple invites match', () => {
    const { db, founder } = createTestDb();
    createInvite(db, {
      invitedEmail: 'a@b.com',
      label: null,
      createdByAdminId: founder.id,
      token: 'commonabcd-1',
    });
    createInvite(db, {
      invitedEmail: 'b@b.com',
      label: null,
      createdByAdminId: founder.id,
      token: 'commonabcd-2',
    });
    const res = findInviteByTokenPrefix(db, 'commonab');
    expect(res.kind).toBe('ambiguous');
  });
});
