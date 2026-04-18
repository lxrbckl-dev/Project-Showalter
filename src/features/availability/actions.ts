'use server';

/**
 * Server actions for the admin schedule page — CRUD over the three
 * availability tables. All mutations wrap in a DB transaction when more
 * than one row is touched so a partial failure can't leave the schedule
 * half-applied.
 *
 * Actions return `{ ok: true }` on success and `{ ok: false, error: string }`
 * on validation failure. Never throws for user-input issues — throws only
 * on unrecoverable internal errors (auth-gate violations, DB I/O failures).
 */

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  availabilityOverrideWindows,
  availabilityOverrides,
  weeklyTemplateWindows,
  type OverrideMode,
} from '@/db/schema/availability';
import { auth } from '@/features/auth/auth';
import {
  isValidDateFormat,
  validateWindowSet,
  type ValidatedWindow,
} from './validate';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Centralized auth guard — every action must ensure the caller has an
 * admin session before touching the DB.
 */
async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!session) {
    throw new Error('Unauthorized');
  }
}

function revalidateSchedule(): void {
  // Keep the admin page's server component in sync after a write.
  revalidatePath('/admin/schedule');
}

/**
 * `setTemplateDay` — replace every window for a given weekday in a single
 * transaction. Passing an empty array deletes all windows for that weekday
 * (the day becomes closed in the template).
 */
export async function setTemplateDay(
  dayOfWeek: number,
  windows: Array<{ startTime: string; endTime: string; note?: string | null }>,
): Promise<ActionResult> {
  await requireAdmin();

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { ok: false, error: 'day_of_week must be an integer 0..6.' };
  }

  const validated: ValidatedWindow[] = windows.map((w) => ({
    startTime: w.startTime,
    endTime: w.endTime,
  }));
  const validationError = validateWindowSet(validated);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const db = getDb();
  // better-sqlite3 exposes the underlying sqlite via the drizzle internals;
  // for a simple multi-statement "replace" we rely on the client's own
  // transaction. Drizzle's transaction() helper wraps this cleanly.
  db.transaction((tx) => {
    tx.delete(weeklyTemplateWindows)
      .where(eq(weeklyTemplateWindows.dayOfWeek, dayOfWeek))
      .run();
    for (const w of windows) {
      tx.insert(weeklyTemplateWindows)
        .values({
          dayOfWeek,
          startTime: w.startTime,
          endTime: w.endTime,
          note: w.note ?? null,
        })
        .run();
    }
  });

  revalidateSchedule();
  return { ok: true };
}

/**
 * `closeDate` — upsert an `availability_overrides` row with mode='closed'
 * for the given date. Any pre-existing override windows for that date are
 * cleared (a closed date cannot have open windows).
 */
export async function closeDate(
  date: string,
  note?: string | null,
): Promise<ActionResult> {
  await requireAdmin();

  if (!isValidDateFormat(date)) {
    return { ok: false, error: 'date must be in YYYY-MM-DD format.' };
  }

  const db = getDb();
  db.transaction((tx) => {
    tx.delete(availabilityOverrideWindows)
      .where(eq(availabilityOverrideWindows.date, date))
      .run();
    // Upsert: delete-then-insert is simpler and safe within a tx.
    tx.delete(availabilityOverrides)
      .where(eq(availabilityOverrides.date, date))
      .run();
    tx.insert(availabilityOverrides)
      .values({
        date,
        mode: 'closed' satisfies OverrideMode,
        note: note ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
  });

  revalidateSchedule();
  return { ok: true };
}

/**
 * `openDateWithWindows` — upsert an `availability_overrides` row with
 * mode='open' and replace every `availability_override_windows` row for
 * that date. Empty `windows` is allowed (the date becomes "open but
 * nothing scheduled" which the resolver treats as []).
 */
export async function openDateWithWindows(
  date: string,
  windows: Array<{ startTime: string; endTime: string }>,
  note?: string | null,
): Promise<ActionResult> {
  await requireAdmin();

  if (!isValidDateFormat(date)) {
    return { ok: false, error: 'date must be in YYYY-MM-DD format.' };
  }
  const validationError = validateWindowSet(windows);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const db = getDb();
  db.transaction((tx) => {
    // Clear any existing override + windows for this date.
    tx.delete(availabilityOverrideWindows)
      .where(eq(availabilityOverrideWindows.date, date))
      .run();
    tx.delete(availabilityOverrides)
      .where(eq(availabilityOverrides.date, date))
      .run();
    tx.insert(availabilityOverrides)
      .values({
        date,
        mode: 'open' satisfies OverrideMode,
        note: note ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
    for (const w of windows) {
      tx.insert(availabilityOverrideWindows)
        .values({
          date,
          startTime: w.startTime,
          endTime: w.endTime,
        })
        .run();
    }
  });

  revalidateSchedule();
  return { ok: true };
}

/**
 * `clearOverride` — remove an override + its child windows. This is the
 * one deliberately "destructive" operation permitted in this feature; the
 * product intent is "remove an override" (which by definition unsets a
 * previously-set row). The underlying template is preserved, so nothing
 * is actually lost — clearing the override simply restores the template's
 * effect for that date.
 */
export async function clearOverride(date: string): Promise<ActionResult> {
  await requireAdmin();

  if (!isValidDateFormat(date)) {
    return { ok: false, error: 'date must be in YYYY-MM-DD format.' };
  }

  const db = getDb();
  db.transaction((tx) => {
    tx.delete(availabilityOverrideWindows)
      .where(eq(availabilityOverrideWindows.date, date))
      .run();
    tx.delete(availabilityOverrides)
      .where(eq(availabilityOverrides.date, date))
      .run();
  });

  revalidateSchedule();
  return { ok: true };
}
