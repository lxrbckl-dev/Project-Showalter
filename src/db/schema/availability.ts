import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Phase 4 availability schema — three tables that together encode the
 * per-date availability computation described in STACK.md § "Availability
 * model":
 *
 *   1. `weekly_template_windows` — recurring weekly pattern. Empty rows for a
 *      given weekday = unavailable (opt-in model: Sawyer explicitly opens
 *      days he can work).
 *   2. `availability_overrides`  — one row per date that overrides the
 *      template. `mode='closed'` hides the day entirely; `mode='open'` means
 *      the `availability_override_windows` rows for that date replace the
 *      template for that single date.
 *   3. `availability_override_windows` — the custom windows attached to an
 *      `open` override.
 *
 * Times are HH:MM (24h) TEXT; dates are YYYY-MM-DD TEXT. FK from override
 * windows to overrides goes through the date PK — deliberately no
 * cross-table FK wiring at the Drizzle level (per ARCHITECTURE.md convention
 * that schemas import no siblings), but the SQL migration installs the
 * actual REFERENCES constraint.
 *
 * Migration: drizzle/0004_availability.sql
 */

export const weeklyTemplateWindows = sqliteTable(
  'weekly_template_windows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    note: text('note'),
  },
  (table) => ({
    dayOfWeekIdx: index('weekly_template_windows_dow_idx').on(table.dayOfWeek),
  }),
);

export const availabilityOverrides = sqliteTable('availability_overrides', {
  date: text('date').primaryKey().notNull(),
  mode: text('mode').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});

export const availabilityOverrideWindows = sqliteTable(
  'availability_override_windows',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
  },
  (table) => ({
    dateIdx: index('availability_override_windows_date_idx').on(table.date),
  }),
);

export type WeeklyTemplateWindowRow = typeof weeklyTemplateWindows.$inferSelect;
export type NewWeeklyTemplateWindowRow = typeof weeklyTemplateWindows.$inferInsert;
export type AvailabilityOverrideRow = typeof availabilityOverrides.$inferSelect;
export type NewAvailabilityOverrideRow = typeof availabilityOverrides.$inferInsert;
export type AvailabilityOverrideWindowRow = typeof availabilityOverrideWindows.$inferSelect;
export type NewAvailabilityOverrideWindowRow = typeof availabilityOverrideWindows.$inferInsert;

/**
 * Two canonical modes for `availability_overrides.mode`. Typed as a union
 * so callers/action validators compile against the same set of strings.
 */
export type OverrideMode = 'open' | 'closed';
