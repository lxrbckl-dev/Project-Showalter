/**
 * Cron job registry — Phase 8B.
 *
 * Called from `src/server/boot.ts` after migrations + reconcile + seed.
 * Registers all four scheduled jobs via node-cron. Each job:
 *   - Uses `noOverlap: true` so two fires of the same job never run concurrently
 *   - Is additionally guarded by the `startRun` idempotency check in `cron-runs.ts`
 *   - Logs a structured JSON line on each execution (success or failure)
 *
 * Jobs:
 *   - nightly_backup       `0 3 * * *`   SQLite backup + 14-day prune
 *   - photo_cleanup        `0 3 * * *`   Booking-photo retention cleanup
 *   - reminders_sweep      every 15 min  24h / 48h pending-booking reminders
 *   - auto_expire_sweep    every 15 min  72h auto-expire of pending bookings
 */

import nodeCron from 'node-cron';
import { getDb } from '@/db';
import { runBackup } from './backup-sqlite';
import { runPhotoCleanup } from './cleanup-photos';
import { runPendingReminders } from './pending-reminders';
import { runAutoExpire } from './auto-expire';

const SCHEDULE_NIGHTLY = '0 3 * * *';
const SCHEDULE_15MIN = '*/15 * * * *';

function makeHandler(name: string, fn: () => Promise<void>) {
  return async () => {
    const start = Date.now();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        msg: `cron:start`,
        task: name,
      }),
    );
    try {
      await fn();
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: 'info',
          timestamp: new Date().toISOString(),
          msg: 'cron:done',
          task: name,
          durationMs: Date.now() - start,
        }),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          timestamp: new Date().toISOString(),
          msg: 'cron:error',
          task: name,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          durationMs: Date.now() - start,
        }),
      );
    }
  };
}

/**
 * Register all cron jobs. Call once from `boot()`.
 *
 * Returns the array of ScheduledTask instances (useful for tests / graceful
 * shutdown).
 */
export function registerCronJobs() {
  const db = getDb();

  const tasks = [
    nodeCron.schedule(
      SCHEDULE_NIGHTLY,
      makeHandler('nightly_backup', () => runBackup(db)),
      { name: 'nightly_backup', noOverlap: true },
    ),
    nodeCron.schedule(
      SCHEDULE_NIGHTLY,
      makeHandler('photo_cleanup', () => runPhotoCleanup(db)),
      { name: 'photo_cleanup', noOverlap: true },
    ),
    nodeCron.schedule(
      SCHEDULE_15MIN,
      makeHandler('reminders_sweep', () => runPendingReminders(db)),
      { name: 'reminders_sweep', noOverlap: true },
    ),
    nodeCron.schedule(
      SCHEDULE_15MIN,
      makeHandler('auto_expire_sweep', () => runAutoExpire(db)),
      { name: 'auto_expire_sweep', noOverlap: true },
    ),
  ];

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      msg: 'cron: registered 4 jobs',
      jobs: ['nightly_backup', 'photo_cleanup', 'reminders_sweep', 'auto_expire_sweep'],
    }),
  );

  return tasks;
}
