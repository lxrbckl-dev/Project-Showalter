import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `cron_runs` table — Phase 8B.
 *
 * Audit trail for every scheduled-job invocation. Drives the admin
 * dashboard's "cron health" widget and the RUNBOOK's inspection query.
 *
 * Each job writes a row with status='running' at the start and updates it
 * to status='ok' or status='error' (with error_message) at completion.
 *
 * Task identifiers used by the four Phase 8B jobs:
 *   - 'nightly_backup'      — SQLite backup at 03:00
 *   - 'photo_cleanup'       — booking-photo retention at 03:00
 *   - 'reminders_sweep'     — 24h/48h pending-booking reminders every 15 min
 *   - 'auto_expire_sweep'   — 72h auto-expire sweep every 15 min
 */
export const cronRuns = sqliteTable(
  'cron_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Job identifier — e.g. 'nightly_backup', 'photo_cleanup'. */
    task: text('task').notNull(),
    /** ISO timestamp when the run began. */
    startedAt: text('started_at').notNull(),
    /** NULL while the run is in progress; set at completion (ok or error). */
    endedAt: text('ended_at'),
    /** 'running' | 'ok' | 'error' */
    status: text('status').notNull().default('running'),
    /** Stack trace / error context when status='error'. NULL otherwise. */
    errorMessage: text('error_message'),
  },
  (table) => ({
    taskStartedIdx: index('cron_runs_task_started_idx').on(
      table.task,
      table.startedAt,
    ),
  }),
);

export type CronRunRow = typeof cronRuns.$inferSelect;
export type NewCronRunRow = typeof cronRuns.$inferInsert;

export type CronRunStatus = 'running' | 'ok' | 'error';
