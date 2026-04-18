import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, inArray } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { notifications } from '@/db/schema/notifications';

/**
 * Pure mark-as-read helpers — Phase 6.
 *
 * Bulk `markAsRead(ids)` for the "mark these N notifications read" action on
 * `/admin/notifications`, plus a zero-arg `markAllAsRead()` for the inbox's
 * "mark all read" button. Both are idempotent — running them twice on the
 * same rows is a no-op.
 */

type Db = BetterSQLite3Database<typeof schema>;

export function markAsReadCore(db: Db, ids: readonly number[]): number {
  if (ids.length === 0) return 0;
  const result = db
    .update(notifications)
    .set({ read: 1 })
    .where(inArray(notifications.id, [...ids]))
    .run();
  // better-sqlite3 reports `changes` on the RunResult.
  return Number(
    (result as unknown as { changes?: number }).changes ?? 0,
  );
}

export function markAllAsReadCore(db: Db): number {
  const result = db
    .update(notifications)
    .set({ read: 1 })
    .where(eq(notifications.read, 0))
    .run();
  return Number(
    (result as unknown as { changes?: number }).changes ?? 0,
  );
}
