/**
 * Nightly photo retention cleanup — Phase 8B.
 *
 * Schedule: `0 3 * * *` (03:00 daily).
 *
 * For every booking in a terminal state (completed / no_show / declined /
 * canceled / expired) where `decided_at` is older than
 * `photo_retention_days_after_resolve` days (from `site_config`):
 *   1. Delete files under /data/uploads/bookings/<id>/
 *   2. Delete matching `booking_attachments` rows
 *
 * The `review_photos` table doesn't exist yet (Phase 9). The handler guards
 * against the missing table via a `sqlite_master` existence check so the job
 * remains forward-compatible when Phase 9 lands.
 *
 * Wrapped in `withCronRun` for `cron_runs` bookkeeping.
 */

import { rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, inArray, lt, isNotNull } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import { bookings, type BookingStatus } from '@/db/schema/bookings';
import { bookingAttachments } from '@/db/schema/booking-attachments';
import { siteConfig } from '@/db/schema/site-config';
import { getSqlite } from '@/db';
import { withCronRun } from './cron-runs';

type Db = BetterSQLite3Database<typeof schema>;

const TASK = 'photo_cleanup';
const UPLOADS_BASE = '/data/uploads/bookings';

/** Terminal statuses — slot no longer held, booking will not change. */
const TERMINAL_STATUSES: BookingStatus[] = [
  'completed',
  'no_show',
  'declined',
  'canceled',
  'expired',
];

export async function runPhotoCleanup(db: Db): Promise<void> {
  await withCronRun(db, TASK, async () => {
    // Read retention window from site_config (default 30 days).
    const config = db.select().from(siteConfig).get();
    const retentionDays = config?.photoRetentionDaysAfterResolve ?? 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffIso = cutoff.toISOString();

    // Find terminal bookings whose decided_at is past the retention window.
    const staleBookings = db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, TERMINAL_STATUSES),
          isNotNull(bookings.decidedAt),
          lt(bookings.decidedAt, cutoffIso),
        ),
      )
      .all();

    if (staleBookings.length === 0) return;

    const bookingIds = staleBookings.map((b) => b.id);

    // 1. Delete booking_attachments rows first (FK cleanup before file delete).
    db.delete(bookingAttachments)
      .where(inArray(bookingAttachments.bookingId, bookingIds))
      .run();

    // 2. Delete files from disk.
    for (const { id } of staleBookings) {
      const dir = join(UPLOADS_BASE, String(id));
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isFile()) {
              rmSync(fullPath);
            }
          } catch {
            // Best-effort per file — skip unreadable entries.
          }
        }
      } catch {
        // Directory doesn't exist — booking had no uploads. Skip.
      }
    }

    // 3. Phase 9 guard: clean review_photos only if the table exists.
    const sqlite = getSqlite();
    const reviewPhotosExists = sqlite
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='review_photos' LIMIT 1`,
      )
      .get();

    if (reviewPhotosExists) {
      const placeholders = bookingIds.map(() => '?').join(', ');
      sqlite
        .prepare(
          `DELETE FROM review_photos
           WHERE review_id IN (
             SELECT id FROM reviews
             WHERE booking_id IN (${placeholders})
               AND submitted_at < ?
           )`,
        )
        .run(...bookingIds, cutoffIso);
    }
  });
}
