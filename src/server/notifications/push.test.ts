import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { pushSubscriptions } from '@/db/schema/push-subscriptions';
import { dispatchToSubscriptions } from './push';

/**
 * Unit tests for the Web Push dispatcher.
 *
 * These exercise the pure core (`dispatchToSubscriptions`) with an in-memory
 * SQLite and an injected sender stub — no actual push-service HTTP is made.
 * The goals:
 *   - 2xx → counted as delivered; no row touched
 *   - 404 → subscription removed
 *   - 410 → subscription removed
 *   - 5xx / transient → counted as failed; row left intact
 *   - Thrown error with statusCode 404 → treated like 404 response
 *   - Empty subscription list → no-op result
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
  return { sqlite, db };
}

function seedSub(
  db: Db,
  endpoint: string,
): { id: number } {
  const rows = db
    .insert(pushSubscriptions)
    .values({
      adminId: 1,
      endpoint,
      p256dh: 'p256dh-' + endpoint,
      auth: 'auth-' + endpoint,
      userAgent: 'TestAgent',
      createdAt: '2026-04-17T00:00:00Z',
    })
    .returning({ id: pushSubscriptions.id })
    .all();
  return { id: rows[0].id };
}

function countSubs(db: Db): number {
  return db.select().from(pushSubscriptions).all().length;
}

describe('dispatchToSubscriptions', () => {
  it('2xx response → delivered count bumped, row intact', async () => {
    const { sqlite, db } = makeDb();
    seedSub(db, 'https://push.example.com/a');
    seedSub(db, 'https://push.example.com/b');

    const sender = vi.fn().mockResolvedValue({ statusCode: 201 });
    const deleteSub = vi.fn();

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b', url: '/admin' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 2, delivered: 2, removed: 0, failed: 0 });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(deleteSub).not.toHaveBeenCalled();
    expect(countSubs(db)).toBe(2);
    sqlite.close();
  });

  it('404 response → subscription removed', async () => {
    const { sqlite, db } = makeDb();
    const { id } = seedSub(db, 'https://push.example.com/gone-404');

    const sender = vi.fn().mockResolvedValue({ statusCode: 404 });
    const deleteSub = vi.fn((rowId: number) => {
      sqlite.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(rowId);
    });

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 1, delivered: 0, removed: 1, failed: 0 });
    expect(deleteSub).toHaveBeenCalledWith(id);
    expect(countSubs(db)).toBe(0);
    sqlite.close();
  });

  it('410 response → subscription removed (Gone)', async () => {
    const { sqlite, db } = makeDb();
    const { id } = seedSub(db, 'https://push.example.com/gone-410');

    const sender = vi.fn().mockResolvedValue({ statusCode: 410 });
    const deleteSub = vi.fn();

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 1, delivered: 0, removed: 1, failed: 0 });
    expect(deleteSub).toHaveBeenCalledWith(id);
    sqlite.close();
  });

  it('500 response → failed count bumped, row NOT removed', async () => {
    const { sqlite, db } = makeDb();
    seedSub(db, 'https://push.example.com/flake');

    const sender = vi.fn().mockResolvedValue({ statusCode: 500 });
    const deleteSub = vi.fn();

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 1, delivered: 0, removed: 0, failed: 1 });
    expect(deleteSub).not.toHaveBeenCalled();
    expect(countSubs(db)).toBe(1);
    sqlite.close();
  });

  it('thrown error with statusCode 410 → cleaned up as gone', async () => {
    const { sqlite, db } = makeDb();
    const { id } = seedSub(db, 'https://push.example.com/throws-410');

    const sender = vi.fn().mockRejectedValue(
      Object.assign(new Error('push endpoint expired'), { statusCode: 410 }),
    );
    const deleteSub = vi.fn();

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 1, delivered: 0, removed: 1, failed: 0 });
    expect(deleteSub).toHaveBeenCalledWith(id);
    sqlite.close();
  });

  it('generic thrown error → failed, row left intact', async () => {
    const { sqlite, db } = makeDb();
    seedSub(db, 'https://push.example.com/flaky');

    const sender = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const deleteSub = vi.fn();

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 1, delivered: 0, removed: 0, failed: 1 });
    expect(deleteSub).not.toHaveBeenCalled();
    sqlite.close();
  });

  it('empty subscription list → no-op', async () => {
    const sender = vi.fn();
    const deleteSub = vi.fn();
    const result = await dispatchToSubscriptions(
      [],
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );
    expect(result).toEqual({ attempted: 0, delivered: 0, removed: 0, failed: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it('payload: title/body/url serialised into the push body', async () => {
    const { sqlite, db } = makeDb();
    seedSub(db, 'https://push.example.com/body-check');

    const bodies: string[] = [];
    const sender = vi.fn(async (_sub: unknown, body: string) => {
      bodies.push(body);
      return { statusCode: 200 };
    });

    const rows = db.select().from(pushSubscriptions).all();
    await dispatchToSubscriptions(
      rows,
      { title: 'New booking request', body: 'Jane wants Mowing', url: '/admin/inbox/42' },
      { sender, deleteSubscription: vi.fn() },
    );

    expect(bodies).toHaveLength(1);
    const parsed = JSON.parse(bodies[0]);
    expect(parsed).toEqual({
      title: 'New booking request',
      body: 'Jane wants Mowing',
      url: '/admin/inbox/42',
    });
    sqlite.close();
  });

  it('payload: url defaults to /admin/notifications when omitted', async () => {
    const { sqlite, db } = makeDb();
    seedSub(db, 'https://push.example.com/default-url');

    const bodies: string[] = [];
    const sender = vi.fn(async (_sub: unknown, body: string) => {
      bodies.push(body);
      return { statusCode: 200 };
    });

    const rows = db.select().from(pushSubscriptions).all();
    await dispatchToSubscriptions(
      rows,
      { title: 'x', body: 'y' },
      { sender, deleteSubscription: vi.fn() },
    );

    const parsed = JSON.parse(bodies[0]);
    expect(parsed.url).toBe('/admin/notifications');
    sqlite.close();
  });

  it('mixed batch: one 200 + one 410 → one delivered, one removed', async () => {
    const { sqlite, db } = makeDb();
    const { id: keptId } = seedSub(db, 'https://push.example.com/kept');
    const { id: goneId } = seedSub(db, 'https://push.example.com/gone');

    const sender = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.includes('gone')) return { statusCode: 410 };
      return { statusCode: 200 };
    });
    const removedIds: number[] = [];
    const deleteSub = (id: number) => removedIds.push(id);

    const rows = db.select().from(pushSubscriptions).all();
    const result = await dispatchToSubscriptions(
      rows,
      { title: 't', body: 'b' },
      { sender, deleteSubscription: deleteSub },
    );

    expect(result).toEqual({ attempted: 2, delivered: 1, removed: 1, failed: 0 });
    expect(removedIds).toEqual([goneId]);
    expect(keptId).not.toBe(goneId);
    sqlite.close();
  });
});
