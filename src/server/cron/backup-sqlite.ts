/**
 * Nightly SQLite backup — Phase 8B.
 *
 * Schedule: `0 3 * * *` (03:00 daily).
 *
 * Uses better-sqlite3's native `.backup()` API to create a consistent
 * point-in-time copy of the database at `/data/backups/YYYY-MM-DD.db`.
 * After a successful backup, prunes files older than 14 days.
 *
 * Wrapped in `withCronRun` so the `cron_runs` table reflects start/end/status.
 */

import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '@/db/schema';
import { getSqlite } from '@/db';
import { withCronRun } from './cron-runs';

type Db = BetterSQLite3Database<typeof schema>;

const TASK = 'nightly_backup';
const BACKUP_DIR = '/data/backups';
const RETENTION_DAYS = 14;

/**
 * Exported for unit-testing: receives the `db` instance explicitly.
 * The cron scheduler calls `runBackup(getDb())`.
 */
export async function runBackup(db: Db): Promise<void> {
  await withCronRun(db, TASK, async () => {
    // Ensure backup directory exists.
    mkdirSync(BACKUP_DIR, { recursive: true });

    // Destination: /data/backups/YYYY-MM-DD.db
    const date = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const dest = join(BACKUP_DIR, `${date}.db`);

    // better-sqlite3 backup API: async copy with WAL checkpoint.
    const sqlite = getSqlite();
    await sqlite.backup(dest);

    // Prune backups older than RETENTION_DAYS.
    pruneOldBackups(BACKUP_DIR, RETENTION_DAYS);
  });
}

/**
 * Delete `.db` files in `dir` whose names (YYYY-MM-DD.db) are older than
 * `retentionDays` days. Files that don't match the naming pattern are skipped.
 */
export function pruneOldBackups(dir: string, retentionDays: number): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // 'YYYY-MM-DD'

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.db$/.test(f));
  } catch {
    // Directory may not exist yet on first run — safe to skip.
    return;
  }

  for (const file of files) {
    const datePart = file.slice(0, 10); // 'YYYY-MM-DD'
    if (datePart < cutoffStr) {
      try {
        rmSync(join(dir, file));
      } catch {
        // Best-effort: log but don't fail the job.
      }
    }
  }
}
