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

import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { cronRuns } from '@/db/schema/cron-runs';
import { createTestDb } from '@/db/test-helpers';
import { startRun, finishRun, failRun, withCronRun } from './cron-runs';

type Db = BetterSQLite3Database<typeof schema>;

let testHandle: ReturnType<typeof createTestDb>;
let db: Db;

describe('cron-runs bookkeeping', () => {
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
  });

  it('startRun inserts a row with status=running and returns its id', () => {
    const id = startRun(db, 'test_task');
    expect(id).toBeTypeOf('number');
    expect(id).toBeGreaterThan(0);

    const row = db.select().from(cronRuns).get();
    expect(row?.task).toBe('test_task');
    expect(row?.status).toBe('running');
    expect(row?.endedAt).toBeNull();
    testHandle.cleanup();
  });

  it('finishRun sets status=ok and endedAt', () => {
    const id = startRun(db, 'test_task')!;
    finishRun(db, id);

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('ok');
    expect(row?.endedAt).toBeTypeOf('string');
    expect(row?.errorMessage).toBeNull();
    testHandle.cleanup();
  });

  it('failRun sets status=error and errorMessage', () => {
    const id = startRun(db, 'test_task')!;
    failRun(db, id, new Error('something went wrong'));

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('error');
    expect(row?.endedAt).toBeTypeOf('string');
    expect(row?.errorMessage).toContain('something went wrong');
    testHandle.cleanup();
  });

  it('failRun accepts non-Error values', () => {
    const id = startRun(db, 'test_task')!;
    failRun(db, id, 'string error');

    const row = db.select().from(cronRuns).get();
    expect(row?.status).toBe('error');
    expect(row?.errorMessage).toBe('string error');
    testHandle.cleanup();
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
    testHandle.cleanup();
  });

  it('startRun allows a new run after the previous one finished', () => {
    const firstId = startRun(db, 'my_task')!;
    finishRun(db, firstId);

    const secondId = startRun(db, 'my_task');
    expect(secondId).toBeTypeOf('number');
    expect(secondId).not.toBeNull();

    const rows = db.select().from(cronRuns).all();
    expect(rows).toHaveLength(2);
    testHandle.cleanup();
  });

  it('startRun allows different tasks to run concurrently', () => {
    const id1 = startRun(db, 'task_a');
    const id2 = startRun(db, 'task_b');
    expect(id1).toBeTypeOf('number');
    expect(id2).toBeTypeOf('number');

    const rows = db.select().from(cronRuns).all();
    expect(rows).toHaveLength(2);
    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
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
    testHandle.cleanup();
  });
});
