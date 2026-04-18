/**
 * Unit tests for cron-runs bookkeeping helpers.
 *
 * Tests:
 *   - startRun inserts a row with status='running'
 *   - finishRun updates to status='ok' with ended_at
 *   - failRun updates to status='error' with error_message
 *   - startRun returns null when a run is already in-flight (idempotency guard)
 *   - withCronRun convenience wrapper covers start/finish/fail lifecycle
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { cronRuns } from '@/db/schema/cron-runs';
import { startRun, finishRun, failRun, withCronRun } from './cron-runs';

type Db = BetterSQLite3Database<typeof schema>;

function makeDb(): { sqlite: Database.Database; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE cron_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      task          TEXT    NOT NULL,
      started_at    TEXT    NOT NULL,
      ended_at      TEXT,
      status        TEXT    NOT NULL DEFAULT 'running',
      error_message TEXT
    );
    CREATE INDEX cron_runs_task_started_idx ON cron_runs(task, started_at);
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) as Db };
}

describe('cron-runs bookkeeping', () => {
  let sqlite: Database.Database;
  let db: Db;

  beforeEach(() => {
    const made = makeDb();
    sqlite = made.sqlite;
    db = made.db;
  });

  it('startRun inserts a row with status=running and returns its id', () => {
    const id = startRun(db, 'test_task');
    expect(id).toBeTypeOf('number');
    expect(id).toBeGreaterThan(0);

    const row = db.select().from(cronRuns).get();
    expect(row?.task).toBe('test_task');
    expect(row?.status).toBe('running');
    expect(row?.endedAt).toBeNull();
    sqlite.close();
  });

  it('finishRun sets status=ok and endedAt', () => {
    const id = startRun(db, 'test_task')!;
    finishRun(db, id);

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('ok');
    expect(row?.endedAt).toBeTypeOf('string');
    expect(row?.errorMessage).toBeNull();
    sqlite.close();
  });

  it('failRun sets status=error and errorMessage', () => {
    const id = startRun(db, 'test_task')!;
    failRun(db, id, new Error('something went wrong'));

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('error');
    expect(row?.endedAt).toBeTypeOf('string');
    expect(row?.errorMessage).toContain('something went wrong');
    sqlite.close();
  });

  it('failRun accepts non-Error values', () => {
    const id = startRun(db, 'test_task')!;
    failRun(db, id, 'string error');

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('error');
    expect(row?.errorMessage).toBe('string error');
    sqlite.close();
  });

  it('startRun returns null when a run is already in-flight (idempotency guard)', () => {
    // First run — still in-flight (status='running')
    const firstId = startRun(db, 'my_task');
    expect(firstId).toBeTypeOf('number');

    // Second call for the same task while first is still running → null
    const secondId = startRun(db, 'my_task');
    expect(secondId).toBeNull();

    // Only one row exists
    const rows = db.select().from(cronRuns).all();
    expect(rows).toHaveLength(1);
    sqlite.close();
  });

  it('startRun allows a new run after the previous one finished', () => {
    const firstId = startRun(db, 'my_task')!;
    finishRun(db, firstId);

    const secondId = startRun(db, 'my_task');
    expect(secondId).toBeTypeOf('number');
    expect(secondId).not.toBeNull();

    const rows = db.select().from(cronRuns).all();
    expect(rows).toHaveLength(2);
    sqlite.close();
  });

  it('startRun allows different tasks to run concurrently', () => {
    const id1 = startRun(db, 'task_a');
    const id2 = startRun(db, 'task_b');
    expect(id1).toBeTypeOf('number');
    expect(id2).toBeTypeOf('number');

    const rows = db.select().from(cronRuns).all();
    expect(rows).toHaveLength(2);
    sqlite.close();
  });

  it('withCronRun resolves and marks ok on success', async () => {
    let called = false;
    const result = await withCronRun(db, 'wrap_task', async () => {
      called = true;
      return 42;
    });

    expect(called).toBe(true);
    expect(result).toBe(42);

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('ok');
    expect(row?.endedAt).toBeTypeOf('string');
    sqlite.close();
  });

  it('withCronRun marks error and rethrows on failure', async () => {
    await expect(
      withCronRun(db, 'fail_task', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('error');
    expect(row?.errorMessage).toContain('boom');
    sqlite.close();
  });

  it('withCronRun returns null when task is already in-flight', async () => {
    // Start a run and leave it in-flight
    startRun(db, 'overlap_task');

    let innerCalled = false;
    const result = await withCronRun(db, 'overlap_task', async () => {
      innerCalled = true;
      return 99;
    });

    expect(result).toBeNull();
    expect(innerCalled).toBe(false);

    // Only the original in-flight row exists
    const rows = db.select().from(cronRuns).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('running');
    sqlite.close();
  });
});
