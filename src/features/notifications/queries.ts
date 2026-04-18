import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { desc, eq, sql } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import {
  notifications,
  type NotificationRow,
} from '@/db/schema/notifications';

/**
 * Read-side queries for Sawyer's in-app inbox — Phase 6.
 *
 * All queries are pure (no side effects) and take a `Db` explicitly so they
 * can be exercised from both server components (via the default `getDb()`
 * wrapper) and unit tests (via an in-memory SQLite).
 *
 * The UI surfaces notifications in two places per STACK.md § Notifications UI:
 *   - Admin shell header badge → `unreadCount(db)`
 *   - `/admin/notifications` page → `listNotifications(db, { limit, offset })`
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface ListOptions {
  limit?: number;
  offset?: number;
  /** Optional filter: only unread rows. */
  onlyUnread?: boolean;
}

export function listNotifications(
  db: Db,
  opts: ListOptions = {},
): NotificationRow[] {
  const { limit = 50, offset = 0, onlyUnread = false } = opts;
  const q = db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
  if (onlyUnread) {
    return q.where(eq(notifications.read, 0)).all();
  }
  return q.all();
}

export function unreadCount(db: Db): number {
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.read, 0))
    .all()[0];
  return Number(row?.c ?? 0);
}

export function getNotification(
  db: Db,
  id: number,
): NotificationRow | null {
  const row = db
    .select()
    .from(notifications)
    .where(eq(notifications.id, id))
    .limit(1)
    .all()[0];
  return row ?? null;
}
