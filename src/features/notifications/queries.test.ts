import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { notifications } from '@/db/schema/notifications';
import { createTestDb } from '@/db/test-helpers';
import { listNotifications, unreadCount } from './queries';
import { markAllAsReadCore, markAsReadCore } from './mark-read-core';

type Db = BetterSQLite3Database<typeof schema>;

let testHandle: ReturnType<typeof createTestDb>;
let db: Db;

function seed(rows: Array<{ kind: string; read: 0 | 1; createdAt: string; bookingId?: number }>): void {
  for (const r of rows) {
    db.insert(notifications)
      .values({
        kind: r.kind,
        payloadJson: '{}',
        read: r.read,
        createdAt: r.createdAt,
        bookingId: r.bookingId ?? null,
      })
      .run();
  }
}

describe('notifications queries + mark-read', () => {
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
  });

  it('unreadCount counts only read=0 booking_submitted rows', () => {
    seed([
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T00:00:00.000Z' },
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T01:00:00.000Z' },
      { kind: 'booking_submitted', read: 1, createdAt: '2026-04-17T02:00:00.000Z' },
    ]);
    expect(unreadCount(db)).toBe(2);
    testHandle.cleanup();
  });

  it('listNotifications returns newest first, respects limit + offset', () => {
    seed([
      { kind: 'a', read: 0, createdAt: '2026-04-17T00:00:00.000Z' },
      { kind: 'b', read: 0, createdAt: '2026-04-17T01:00:00.000Z' },
      { kind: 'c', read: 0, createdAt: '2026-04-17T02:00:00.000Z' },
    ]);
    const first = listNotifications(db, { limit: 2 });
    expect(first.map((r) => r.kind)).toEqual(['c', 'b']);
    const next = listNotifications(db, { limit: 2, offset: 2 });
    expect(next.map((r) => r.kind)).toEqual(['a']);
    testHandle.cleanup();
  });

  it('listNotifications with onlyUnread filters out read rows', () => {
    seed([
      { kind: 'a', read: 1, createdAt: '2026-04-17T00:00:00.000Z' },
      { kind: 'b', read: 0, createdAt: '2026-04-17T01:00:00.000Z' },
    ]);
    const onlyUnread = listNotifications(db, { onlyUnread: true });
    expect(onlyUnread.map((r) => r.kind)).toEqual(['b']);
    testHandle.cleanup();
  });

  // The unreadCount-using tests below use `booking_submitted` as the kind
  // because unreadCount() is now scoped to that kind only (the Inbox tab
  // badge is "new pending bookings I haven't looked at" — nothing else).
  it('markAsReadCore flips specified ids only', () => {
    seed([
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T00:00:00.000Z' },
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T01:00:00.000Z' },
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T02:00:00.000Z' },
    ]);
    const ids = db.select().from(notifications).all().map((r) => r.id);
    const changed = markAsReadCore(db, [ids[0], ids[2]]);
    expect(changed).toBe(2);
    expect(unreadCount(db)).toBe(1);
    const after = db.select().from(notifications).all();
    expect(after.find((r) => r.id === ids[0])!.read).toBe(1);
    expect(after.find((r) => r.id === ids[1])!.read).toBe(0);
    expect(after.find((r) => r.id === ids[2])!.read).toBe(1);
    testHandle.cleanup();
  });

  it('markAsReadCore with empty array is a no-op', () => {
    seed([
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T00:00:00.000Z' },
    ]);
    expect(markAsReadCore(db, [])).toBe(0);
    expect(unreadCount(db)).toBe(1);
    testHandle.cleanup();
  });

  it('markAllAsReadCore clears the unread count', () => {
    seed([
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T00:00:00.000Z' },
      { kind: 'booking_submitted', read: 0, createdAt: '2026-04-17T01:00:00.000Z' },
      { kind: 'booking_submitted', read: 1, createdAt: '2026-04-17T02:00:00.000Z' },
    ]);
    expect(markAllAsReadCore(db)).toBe(2);
    expect(unreadCount(db)).toBe(0);
    // Second run should be a no-op (everything already read).
    expect(markAllAsReadCore(db)).toBe(0);
    testHandle.cleanup();
  });

  it('unreadCount ignores non-booking_submitted kinds even if unread', () => {
    seed([
      { kind: 'booking_canceled_by_customer', read: 0, createdAt: '2026-04-17T00:00:00.000Z' },
      { kind: 'review_submitted', read: 0, createdAt: '2026-04-17T01:00:00.000Z' },
      { kind: 'booking_expired', read: 0, createdAt: '2026-04-17T02:00:00.000Z' },
    ]);
    expect(unreadCount(db)).toBe(0);
    testHandle.cleanup();
  });
});
