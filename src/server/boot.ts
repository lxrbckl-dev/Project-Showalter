import { migrate } from '@/db/migrate';
import { getDb, resolveDatabasePath } from '@/db';
import { reconcileAdmins } from '@/features/auth/reconcile';
import { seedFromBrief } from '@/features/site-config/seed';

let booted = false;

/**
 * Called by Next.js `instrumentation.ts` at server init, before any HTTP
 * traffic is accepted. Runs DB migrations; on failure, logs to stderr and
 * exits the process with a non-zero code rather than serving a half-migrated
 * database.
 *
 * After migrations, reconciles the `admins` table against the
 * `ADMIN_EMAILS` environment variable (comma-separated list of admin emails).
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

  // Reconcile ADMIN_EMAILS after migrations complete.
  try {
    const raw = process.env.ADMIN_EMAILS ?? '';
    const emailList = raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const db = getDb() as Parameters<typeof reconcileAdmins>[0];
    await reconcileAdmins(db, emailList);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Non-fatal: a reconciliation failure should not prevent the server from
    // starting. Log the error and continue.
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        msg: 'boot: admin reconciliation failed',
        error: message,
      }),
    );
  }
}
