import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { pushSubscriptions } from '@/db/schema/push-subscriptions';
import {
  hasSubscriptionForEndpoint,
  subscribePushCore,
  unsubscribePushCore,
} from './subscribe-core';

/**
 * Unit tests for the pure subscribe / unsubscribe helpers. The server
 * action thin-wrappers in `actions.ts` just add session resolution +
 * path revalidation on top of these.
 */

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
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
    CREATE TABLE push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      admin_id INTEGER NOT NULL REFERENCES admins(id),
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX push_subscriptions_admin_idx ON push_subscriptions(admin_id);
  `);
  const db = drizzle(sqlite, { schema }) as Db;
  db.insert(schema.admins)
    .values({
      email: 'sawyer@example.com',
      active: 1,
      enrolledAt: '2026-04-17T00:00:00Z',
      createdAt: '2026-04-17T00:00:00Z',
    })
    .run();
  db.insert(schema.admins)
    .values({
      email: 'disabled@example.com',
      active: 0,
      enrolledAt: null,
      createdAt: '2026-04-17T00:00:00Z',
    })
    .run();
  return { sqlite, db };
}

const validInput = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BPublicKey==', auth: 'AuthSecret==' },
};

describe('subscribePushCore', () => {
  it('creates a new subscription row for a valid payload', () => {
    const { sqlite, db } = makeDb();
    const result = subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
      userAgent: 'Mozilla/5.0 iPhone',
    });
    if (!result.ok) throw new Error('expected success, got ' + JSON.stringify(result));
    expect(result.created).toBe(true);

    const rows = db.select().from(pushSubscriptions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe(1);
    expect(rows[0].endpoint).toBe(validInput.endpoint);
    expect(rows[0].userAgent).toBe('Mozilla/5.0 iPhone');
    sqlite.close();
  });

  it('upserts on existing endpoint — updates keys + ua, no duplicate rows', () => {
    const { sqlite, db } = makeDb();
    const first = subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
      userAgent: 'FirstAgent',
    });
    if (!first.ok) throw new Error('expected success');

    const second = subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: { ...validInput, keys: { p256dh: 'RotatedKey', auth: 'RotatedAuth' } },
      userAgent: 'SecondAgent',
    });
    if (!second.ok) throw new Error('expected success');
    expect(second.created).toBe(false);
    expect(second.subscriptionId).toBe(first.subscriptionId);

    const rows = db.select().from(pushSubscriptions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe('RotatedKey');
    expect(rows[0].userAgent).toBe('SecondAgent');
    sqlite.close();
  });

  it('rejects payloads that fail schema validation', () => {
    const { sqlite, db } = makeDb();
    const result = subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: { endpoint: 'not-a-url', keys: { p256dh: '', auth: '' } },
    });
    if (result.ok) throw new Error('expected validation failure');
    expect(result.kind).toBe('validation');
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
    sqlite.close();
  });

  it('rejects when the admin is inactive (soft-disabled)', () => {
    const { sqlite, db } = makeDb();
    const result = subscribePushCore({
      db,
      adminEmail: 'disabled@example.com',
      input: validInput,
    });
    if (result.ok) throw new Error('expected admin_not_found');
    expect(result.kind).toBe('admin_not_found');
    sqlite.close();
  });

  it('rejects when the admin email is unknown', () => {
    const { sqlite, db } = makeDb();
    const result = subscribePushCore({
      db,
      adminEmail: 'stranger@example.com',
      input: validInput,
    });
    if (result.ok) throw new Error('expected admin_not_found');
    expect(result.kind).toBe('admin_not_found');
    sqlite.close();
  });

  it('normalizes admin email to lowercase', () => {
    const { sqlite, db } = makeDb();
    const result = subscribePushCore({
      db,
      adminEmail: 'SAWYER@example.com',
      input: validInput,
    });
    expect(result.ok).toBe(true);
    sqlite.close();
  });
});

describe('unsubscribePushCore', () => {
  it('removes an existing subscription for the admin', () => {
    const { sqlite, db } = makeDb();
    subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
    });
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);

    const result = unsubscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      endpoint: validInput.endpoint,
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.removed).toBe(1);
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(0);
    sqlite.close();
  });

  it('returns not_found for an unknown endpoint', () => {
    const { sqlite, db } = makeDb();
    subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
    });
    const result = unsubscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      endpoint: 'https://fcm.googleapis.com/fcm/send/not-here',
    });
    if (result.ok) throw new Error('expected not_found');
    expect(result.kind).toBe('not_found');
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
    sqlite.close();
  });

  it('does not let another admin unsubscribe someone else\'s device', () => {
    const { sqlite, db } = makeDb();
    // Seed a second admin
    db.insert(schema.admins)
      .values({
        email: 'other@example.com',
        active: 1,
        enrolledAt: '2026-04-17T00:00:00Z',
        createdAt: '2026-04-17T00:00:00Z',
      })
      .run();
    subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
    });
    const result = unsubscribePushCore({
      db,
      adminEmail: 'other@example.com',
      endpoint: validInput.endpoint,
    });
    if (result.ok) throw new Error('expected scoped not_found');
    expect(result.kind).toBe('not_found');
    expect(db.select().from(pushSubscriptions).all()).toHaveLength(1);
    sqlite.close();
  });
});

describe('hasSubscriptionForEndpoint', () => {
  it('returns true when the admin has subscribed on this endpoint', () => {
    const { sqlite, db } = makeDb();
    subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
    });
    expect(
      hasSubscriptionForEndpoint({
        db,
        adminEmail: 'sawyer@example.com',
        endpoint: validInput.endpoint,
      }),
    ).toBe(true);
    sqlite.close();
  });

  it('returns false when the endpoint belongs to another admin', () => {
    const { sqlite, db } = makeDb();
    db.insert(schema.admins)
      .values({
        email: 'other@example.com',
        active: 1,
        enrolledAt: '2026-04-17T00:00:00Z',
        createdAt: '2026-04-17T00:00:00Z',
      })
      .run();
    subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
    });
    expect(
      hasSubscriptionForEndpoint({
        db,
        adminEmail: 'other@example.com',
        endpoint: validInput.endpoint,
      }),
    ).toBe(false);
    sqlite.close();
  });

  it('returns false for an unknown endpoint', () => {
    const { sqlite, db } = makeDb();
    subscribePushCore({
      db,
      adminEmail: 'sawyer@example.com',
      input: validInput,
    });
    expect(
      hasSubscriptionForEndpoint({
        db,
        adminEmail: 'sawyer@example.com',
        endpoint: 'https://fcm.googleapis.com/fcm/send/missing',
      }),
    ).toBe(false);
    sqlite.close();
  });
});
