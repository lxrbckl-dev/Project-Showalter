import { migrate } from '@/db/migrate';
import { resolveDatabasePath } from '@/db';

let booted = false;

/**
 * Called by Next.js `instrumentation.ts` at server init, before any HTTP
 * traffic is accepted. Runs DB migrations; on failure, logs to stderr and
 * exits the process with a non-zero code rather than serving a half-migrated
 * database.
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
}
