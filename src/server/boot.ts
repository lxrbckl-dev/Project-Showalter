import { migrate } from '@/db/migrate';
import { getDb, resolveDatabasePath } from '@/db';
import { seedFromBrief } from '@/features/site-config/seed';
import { registerCronJobs } from '@/server/cron';

let booted = false;

/**
 * Called by Next.js `instrumentation.ts` at server init, before any HTTP
 * traffic is accepted. Runs DB migrations; on failure, logs to stderr and
 * exits the process with a non-zero code rather than serving a half-migrated
 * database.
 *
 * Phase 1C (issue #83) retired the env-driven admin reconciler. Admins now
 * bootstrap via the "first visitor claims founding admin" flow at
 * `/admin/login` and are added thereafter via single-use invite links
 * issued from `/admin/settings/admins`. No env-driven reconciliation runs
 * at boot.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;

  try {
    const { applied, skipped } = migrate();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        msg: 'boot: migrations complete',
        db: resolveDatabasePath(),
        applied,
        skipped,
      }),
    );

    // Overlay Sawyer's personal data from the brief when the env flag is set.
    // Idempotent: guards on phone IS NULL and empty services table.
    seedFromBrief(getDb());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'fatal',
        timestamp: new Date().toISOString(),
        msg: 'boot: migrations failed',
        error: message,
        stack,
      }),
    );
    process.exit(1);
  }

  // Register cron jobs after migrations + seed.
  // Non-fatal: a cron registration failure should not prevent the server from
  // starting, but it will log prominently.
  try {
    registerCronJobs();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        msg: 'boot: cron job registration failed',
        error: message,
      }),
    );
  }
}
