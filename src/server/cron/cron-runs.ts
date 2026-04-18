/**
 * Cron-run bookkeeping helpers — Phase 8B.
 *
 * Every scheduled job calls `startRun()` at the top, then `finishRun()` (ok)
 * or `failRun()` (error) at the end. These write to the `cron_runs` table so
 * the admin dashboard and RUNBOOK queries have last-run timestamp + status per
 * task.
 *
 * Guards:
 *   - If a run for the same task already has status='running' (i.e. a previous
 *     invocation is still in progress), `startRun()` returns null and the
 *     caller skips execution. This enforces idempotency: two concurrent
 *     invocations of the same task cannot both proceed.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { cronRuns } from '@/db/schema/cron-runs';

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Insert a new `cron_runs` row with status='running'.
 *
 * Returns the new row's `id`, or `null` if another invocation of the same
 * task is already running (idempotency guard).
 */
export function startRun(db: Db, task: string): number | null {
  // Idempotency guard: don't start a second concurrent run for the same task.
  const inFlight = db
    .select({ id: cronRuns.id })
    .from(cronRuns)
    .where(and(eq(cronRuns.task, task), eq(cronRuns.status, 'running')))
    .all();

  if (inFlight.length > 0) {
    return null;
  }

  const result = db
    .insert(cronRuns)
    .values({
      task,
      startedAt: new Date().toISOString(),
      status: 'running',
    })
    .returning({ id: cronRuns.id })
    .get();

  return result?.id ?? null;
}

/**
 * Mark a cron run as completed successfully.
 */
export function finishRun(db: Db, runId: number): void {
  db.update(cronRuns)
    .set({
      endedAt: new Date().toISOString(),
      status: 'ok',
    })
    .where(eq(cronRuns.id, runId))
    .run();
}

/**
 * Mark a cron run as failed, recording the error message.
 */
export function failRun(db: Db, runId: number, error: unknown): void {
  const message =
    error instanceof Error
      ? (error.stack ?? error.message)
      : String(error);

  db.update(cronRuns)
    .set({
      endedAt: new Date().toISOString(),
      status: 'error',
      errorMessage: message,
    })
    .where(eq(cronRuns.id, runId))
    .run();
}

/**
 * Convenience wrapper: run `fn`, automatically bookkeeping start/finish/fail.
 * Returns `null` if the task is already running (skipped due to idempotency guard).
 */
export async function withCronRun<T>(
  db: Db,
  task: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const runId = startRun(db, task);
  if (runId === null) {
    // Another invocation is already in progress — skip.
    return null;
  }
  try {
    const result = await fn();
    finishRun(db, runId);
    return result;
  } catch (err) {
    failRun(db, runId, err);
    throw err;
  }
}
