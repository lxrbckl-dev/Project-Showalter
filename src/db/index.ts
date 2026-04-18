import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';

/**
 * Resolve the DB filesystem path from `DATABASE_URL`.
 *
 *   file:/data/sqlite.db  →  /data/sqlite.db   (prod default)
 *   file:./dev.db         →  ./dev.db          (dev default)
 *
 * Anything without a `file:` prefix is treated as a raw path.
 */
export function resolveDatabasePath(raw: string | undefined = process.env.DATABASE_URL): string {
  const value = raw ?? 'file:./dev.db';
  return value.startsWith('file:') ? value.slice('file:'.length) : value;
}

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

export function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite;
  const path = resolveDatabasePath();

  // Ensure the parent directory exists (e.g. `/data/` inside the container).
  // Harmless for relative dev paths like `./dev.db`.
  try {
    const dir = dirname(path);
    if (dir && dir !== '.' && dir !== '') {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Directory creation is best-effort; sqlite open will surface real errors.
  }

  _sqlite = new Database(path);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  return _sqlite;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;
  _db = drizzle(getSqlite(), { schema });
  return _db;
}

export { schema };
