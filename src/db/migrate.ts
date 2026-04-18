import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSqlite, resolveDatabasePath } from './index';

/**
 * Run every migration under `./drizzle/*.sql` in lexicographic order, exactly
 * once each. A lightweight bookkeeping table (`_migrations`) tracks applied
 * filenames.
 *
 * Drizzle-kit emits SQL files named like `0000_initial.sql`, `0001_xxx.sql`,
 * etc. Running them in filename order gives us stable, deterministic ordering.
 *
 * Each file is executed inside a transaction. If any statement fails, the
 * transaction rolls back and the error propagates — callers (boot) are
 * responsible for exiting non-zero.
 */
const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

export function migrate(): { applied: string[]; skipped: string[] } {
  const sqlite = getSqlite();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const alreadyApplied = new Set(
    sqlite
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r: unknown) => (r as { name: string }).name),
  );

  const applied: string[] = [];
  const skipped: string[] = [];

  const insertApplied = sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const tx = sqlite.transaction(() => {
      sqlite.exec(sql);
      insertApplied.run(file);
    });
    tx();
    applied.push(file);
  }

  return { applied, skipped };
}

// Allow `pnpm db:migrate` to invoke this module directly.
if (require.main === module) {
  try {
    const { applied, skipped } = migrate();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'migrations complete',
        db: resolveDatabasePath(),
        applied,
        skipped,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'migrations failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exit(1);
  }
}
