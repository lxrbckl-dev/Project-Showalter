-- Phase 8B migration — Cron job audit trail.
--
-- Adds `cron_runs` table to track every scheduled-job invocation. The admin
-- dashboard reads this table to surface last-run timestamp + status per task
-- (per STACK.md § Scheduled jobs and RUNBOOK.md § Cron health inspection).
--
-- Columns:
--   task        — job identifier, e.g. 'nightly_backup', 'photo_cleanup',
--                 'reminders_sweep', 'auto_expire_sweep'
--   started_at  — ISO timestamp when the run began
--   ended_at    — NULL while in progress; set on completion (ok or error)
--   status      — 'running' | 'ok' | 'error'
--   error_message — stack trace / error context when status='error'; NULL otherwise
--
-- No FK constraints — cron_runs is a standalone audit log.

CREATE TABLE `cron_runs` (
  `id`            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `task`          TEXT    NOT NULL,
  `started_at`    TEXT    NOT NULL,
  `ended_at`      TEXT,
  `status`        TEXT    NOT NULL DEFAULT 'running',
  `error_message` TEXT
);

-- Index for the admin dashboard query: latest run per task, ordered by time.
CREATE INDEX `cron_runs_task_started_idx`
    ON `cron_runs`(`task`, `started_at`);
