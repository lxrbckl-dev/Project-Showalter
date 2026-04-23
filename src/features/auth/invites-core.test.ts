import { describe, it, expect } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { admins, adminInvites } from '@/db/schema';
import { createTestDb } from '@/db/test-helpers';
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

type DB = BetterSQLite3Database<typeof schema>;

function bootstrapFounder(db: DB) {
  const now = new Date('2026-04-17T12:00:00Z').toISOString();
  db.insert(admins)
    .values({
      email: 'founder@example.com',
      active: 1,
      enrolledAt: now,
      createdAt: now,
    })
    .run();
  return db.select().from(admins).all()[0]!;
}

function bootstrapDb() {
  const handle = createTestDb({ inMemory: true });
  const typedDb = handle.db as unknown as DB;
  const founder = bootstrapFounder(typedDb);
  return { ...handle, db: typedDb, founder };
}

const cred = {
  credentialId: 'cred-xyz',
  publicKeyB64: 'Zm9v',
  counter: 0,
  deviceType: 'singleDevice' as string | null,
};

describe('createInvite', () => {
  it('lowercases + trims email, sets expires_at = created_at + 24h', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const now = new Date('2026-04-17T12:00:00Z');
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
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
    cleanup();
  });

  it('stores null label when empty string supplied', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'a@b.com',
      label: '   ',
      createdByAdminId: founder.id,
    });
    expect(row.label).toBeNull();
    cleanup();
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
        {
          expiresAt: '2020-01-01T00:00:00Z',
          usedAt: '2020-01-01T01:00:00Z',
          revokedAt: null,
        },
        '2026-04-17T00:00:00Z',
      ),
    ).toBe('used');
  });
});

describe('validateInvite', () => {
  it('rejects unknown tokens', () => {
    const { db, cleanup } = bootstrapDb();
    const res = validateInvite(db as Parameters<typeof validateInvite>[0], 'missing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe('unknown');
    cleanup();
  });

  it('rejects expired', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const longAgo = new Date('2020-01-01T00:00:00Z');
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
      now: longAgo,
    });
    const res = validateInvite(db as Parameters<typeof validateInvite>[0], row.token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe('expired');
    cleanup();
  });

  it('rejects revoked', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db as Parameters<typeof revokeInviteByToken>[0], row.token);
    const res = validateInvite(db as Parameters<typeof validateInvite>[0], row.token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe('revoked');
    cleanup();
  });

  it('accepts a fresh invite', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    const res = validateInvite(db as Parameters<typeof validateInvite>[0], row.token);
    expect(res.ok).toBe(true);
    cleanup();
  });
});

describe('acceptInvite', () => {
  it('happy path inserts admin + credential + recovery code + marks invite used', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'invitee@example.com',
      label: null,
      createdByAdminId: founder.id,
    });

    const res = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
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

    const adminRows = db.select().from(admins).all();
    // founder + new admin
    expect(adminRows.length).toBe(2);

    const updated = db.select().from(adminInvites).all()[0];
    expect(updated?.usedAt).not.toBeNull();
    expect(updated?.usedByAdminId).toBeTruthy();
    cleanup();
  });

  it('rejects mismatched email (case-insensitive compare)', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'a@b.com',
      label: null,
      createdByAdminId: founder.id,
    });

    const res = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'c@d.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(false);

    const adminRows = db.select().from(admins).all();
    expect(adminRows.length).toBe(1); // only founder
    const inviteRow = db.select().from(adminInvites).all()[0];
    expect(inviteRow?.usedAt).toBeNull();
    cleanup();
  });

  it('accepts when case differs (lowercased match)', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'Mixed@Case.com',
      label: null,
      createdByAdminId: founder.id,
    });
    const res = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'MIXED@case.COM',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.email).toBe('mixed@case.com');
    cleanup();
  });

  it('rejects an expired invite', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const longAgo = new Date('2020-01-01T00:00:00Z');
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
      now: longAgo,
    });
    const res = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(false);
    cleanup();
  });

  it('rejects a revoked invite', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db as Parameters<typeof revokeInviteByToken>[0], row.token);
    const res = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(res.ok).toBe(false);
    cleanup();
  });

  it('rejects a used invite (second accept fails)', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });

    const first = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    expect(first.ok).toBe(true);

    const second = acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: { ...cred, credentialId: 'cred-different' },
      hashedRecoveryCode: 'hashed2',
    });
    expect(second.ok).toBe(false);

    const adminRows = db.select().from(admins).all();
    expect(adminRows.length).toBe(2); // founder + first-accept only
    cleanup();
  });
});

describe('revokeInviteByToken', () => {
  it('sets revokedAt on a pending invite', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    const res = revokeInviteByToken(
      db as Parameters<typeof revokeInviteByToken>[0],
      row.token,
    );
    expect(res.ok).toBe(true);

    const updated = db.select().from(adminInvites).all()[0];
    expect(updated?.revokedAt).not.toBeNull();
    cleanup();
  });

  it('is idempotent on an already-revoked invite', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db as Parameters<typeof revokeInviteByToken>[0], row.token);
    const res = revokeInviteByToken(
      db as Parameters<typeof revokeInviteByToken>[0],
      row.token,
    );
    expect(res.ok).toBe(true);
    cleanup();
  });

  it('refuses to revoke a used invite', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
    });
    acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: row.token,
      submittedEmail: 'x@y.com',
      credential: cred,
      hashedRecoveryCode: 'hashed',
    });
    const res = revokeInviteByToken(
      db as Parameters<typeof revokeInviteByToken>[0],
      row.token,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('already_terminal');
    cleanup();
  });
});

describe('listInvites', () => {
  it('returns derived status for each invite', () => {
    const { sqlite, db, founder, cleanup } = bootstrapDb();
    const longAgo = new Date('2020-01-01T00:00:00Z');

    createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'pending@example.com',
      label: 'Pending',
      createdByAdminId: founder.id,
    });
    createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'expired@example.com',
      label: null,
      createdByAdminId: founder.id,
      now: longAgo,
    });
    const revoked = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'revoked@example.com',
      label: null,
      createdByAdminId: founder.id,
    });
    revokeInviteByToken(db as Parameters<typeof revokeInviteByToken>[0], revoked.token);

    const used = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'used@example.com',
      label: null,
      createdByAdminId: founder.id,
    });
    acceptInvite(sqlite, db as Parameters<typeof acceptInvite>[1], {
      token: used.token,
      submittedEmail: 'used@example.com',
      credential: cred,
      hashedRecoveryCode: 'h',
    });

    const views = listInvites(db as Parameters<typeof listInvites>[0]);
    const byEmail = Object.fromEntries(views.map((v) => [v.invitedEmail, v.status]));
    expect(byEmail['pending@example.com']).toBe('pending');
    expect(byEmail['expired@example.com']).toBe('expired');
    expect(byEmail['revoked@example.com']).toBe('revoked');
    expect(byEmail['used@example.com']).toBe('used');

    const usedView = views.find((v) => v.invitedEmail === 'used@example.com');
    expect(usedView?.usedByEmail).toBe('used@example.com');
    expect(
      views.every((v) => v.createdByEmail === 'founder@example.com'),
    ).toBe(true);
    cleanup();
  });
});

describe('findInviteByTokenPrefix', () => {
  it('rejects short prefixes', () => {
    const { db, cleanup } = bootstrapDb();
    const res = findInviteByTokenPrefix(
      db as Parameters<typeof findInviteByTokenPrefix>[0],
      'x'.repeat(INVITE_TOKEN_PREFIX_MIN - 1),
    );
    expect(res.kind).toBe('none');
    cleanup();
  });

  it('matches exactly one when unique', () => {
    const { db, founder, cleanup } = bootstrapDb();
    const row = createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'x@y.com',
      label: null,
      createdByAdminId: founder.id,
      token: 'abcdef0123-unique',
    });
    const res = findInviteByTokenPrefix(
      db as Parameters<typeof findInviteByTokenPrefix>[0],
      'abcdef0',
    );
    expect(res.kind).toBe('one');
    if (res.kind === 'one') expect(res.row.token).toBe(row.token);
    cleanup();
  });

  it('returns ambiguous when multiple invites match', () => {
    const { db, founder, cleanup } = bootstrapDb();
    createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'a@b.com',
      label: null,
      createdByAdminId: founder.id,
      token: 'commonabcd-1',
    });
    createInvite(db as Parameters<typeof createInvite>[0], {
      invitedEmail: 'b@b.com',
      label: null,
      createdByAdminId: founder.id,
      token: 'commonabcd-2',
    });
    const res = findInviteByTokenPrefix(
      db as Parameters<typeof findInviteByTokenPrefix>[0],
      'commonab',
    );
    expect(res.kind).toBe('ambiguous');
    cleanup();
  });
});
