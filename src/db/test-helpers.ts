/**
 * Test helper — creates a fresh SQLite database with all real Drizzle
 * migrations applied. Eliminates hand-rolled CREATE TABLE blocks in tests
 * so schema drift between migrations and test setups is impossible.
 *
 * Usage:
 *
 *   import { createTestDb } from '@/db/test-helpers';
 *
 *   let testHandle: ReturnType<typeof createTestDb>;
 *
 *   beforeEach(() => {
 *     testHandle = createTestDb();
 *   });
 *
 *   afterEach(() => {
 *     testHandle.cleanup();
 *   });
 *
 * For tests that need process.env.DATABASE_URL to point at the temp file
 * (e.g. tests that call `vi.resetModules()` and re-import code that reads
 * the singleton at import time):
 *
 *   beforeEach(() => {
 *     testHandle = createTestDb();
 *     process.env.DATABASE_URL = `file:${testHandle.dbPath}`;
 *   });
 *
 * For tests that use only :memory: and inject the db directly, the `dbPath`
 * is ':memory:' and process.env does not need to be set.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readdirSync, readFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as schema from './schema';

/** Absolute path to the project root (two levels up from src/db/). */
const PROJECT_ROOT = join(__dirname, '..', '..');
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'drizzle');

type TestDb = {
  /** Raw better-sqlite3 handle. */
  sqlite: Database.Database;
  /** Drizzle ORM wrapper with full project schema. */
  db: ReturnType<typeof drizzle<typeof schema>>;
  /**
   * Filesystem path of the database file, or ':memory:' for in-memory DBs.
   * Useful when a test needs process.env.DATABASE_URL = `file:${dbPath}`.
   */
  dbPath: string;
  /** Close the DB and delete the temp file (no-op for in-memory DBs). */
  cleanup: () => void;
};

/** Apply all migrations from ./drizzle/*.sql to the given sqlite handle. */
function applyMigrations(sqlite: Database.Database): void {
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

  const insertApplied = sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const tx = sqlite.transaction(() => {
      sqlite.exec(sql);
      insertApplied.run(file);
    });
    tx();
  }
}

/**
 * Create a fresh test database with all migrations applied.
 *
 * @param opts.inMemory - Use :memory: instead of a temp file (default: false).
 *   In-memory is faster; use on-disk when the code under test reads
 *   DATABASE_URL and re-opens the connection (e.g. after vi.resetModules()).
 */
export function createTestDb(opts: { inMemory?: boolean } = {}): TestDb {
  const inMemory = opts.inMemory ?? false;

  let dbPath: string;
  let tmpDirPath: string | null = null;

  if (inMemory) {
    dbPath = ':memory:';
  } else {
    tmpDirPath = mkdtempSync(join(tmpdir(), 'showalter-test-'));
    dbPath = join(tmpDirPath, 'test.db');
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  applyMigrations(sqlite);

  const db = drizzle(sqlite, { schema });

  function cleanup(): void {
    try {
      sqlite.close();
    } catch {
      // best-effort
    }
    if (!inMemory && tmpDirPath) {
      try {
        unlinkSync(dbPath);
      } catch {
        // best-effort
      }
      try {
        // Remove the temp dir (it only ever contains the one db file).
        rmdirSync(tmpDirPath);
      } catch {
        // best-effort
      }
    }
  }

  return { sqlite, db, dbPath, cleanup };
}
