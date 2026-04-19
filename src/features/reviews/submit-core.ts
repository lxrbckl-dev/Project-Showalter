import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type * as schema from '@/db/schema';
import {
  reviews,
  type ReviewRow,
} from '@/db/schema/reviews';
import { reviewPhotos } from '@/db/schema/review-photos';
import { sitePhotos } from '@/db/schema/site-photos';
import { siteConfig } from '@/db/schema/site-config';

/**
 * Pure, testable core for the public review-submit flow — Phase 9.
 *
 * Split from `submit.ts` (the `'use server'` wrapper) so unit tests can
 * spin up an in-memory SQLite and exercise:
 *   - Zod validation of rating + review_text
 *   - idempotency (second submit with same token → rejected)
 *   - auto-publish rule: review photos copy into site_photos iff
 *     rating >= site_config.min_rating_for_auto_publish AND
 *     site_config.auto_publish_top_review_photos = 1
 *
 * The file-write side (upload -> review_photos rows) lives in the
 * server-action wrapper because `upload()` is async and needs the Next
 * FormData surface; this core handles the DB-side mutation + the
 * auto-publish copy, both of which are synchronous (better-sqlite3).
 */

type Db = BetterSQLite3Database<typeof schema>;

/** Zod schema for the customer-visible form fields. */
export const submitInputSchema = z.object({
  /** 1..5 inclusive. */
  rating: z.number().int().min(1).max(5),
  /** Optional freeform text; capped at 2000 chars (same cap as booking notes). */
  reviewText: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

export type SubmitInput = z.infer<typeof submitInputSchema>;

export interface UploadedPhoto {
  /** Relative path under /data/uploads — e.g. reviews/42/<uuid>.jpg */
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

export type SubmitCoreResult =
  | {
      ok: true;
      review: ReviewRow;
      /**
       * True when the auto-publish rule fired and at least one site_photos
       * row was inserted. Useful for the response UI ("thanks, your photo
       * is now on the site!").
       */
      autoPublished: boolean;
      publishedPhotoCount: number;
    }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'already_submitted' }
  | { ok: false; kind: 'invalid_input'; errors: string[] };

export interface SubmitCoreInput {
  token: string;
  /** Un-validated user input (the wrapper passes raw form fields). */
  input: unknown;
  /**
   * The photos that have already been written to disk by the wrapper. The
   * core only touches DB rows — it does NOT touch the filesystem, keeping
   * the path through this function synchronous and unit-testable.
   */
  photos: UploadedPhoto[];
  db: Db;
  now?: Date;
}

export function submitReviewCore(
  opts: SubmitCoreInput,
): SubmitCoreResult {
  const { token, input, photos, db, now = new Date() } = opts;

  // 1. Resolve the review row by token. Unknown token -> not_found (the UI
  //    surfaces this as a vague 404 to match the no-enumeration rule).
  const row = db
    .select()
    .from(reviews)
    .where(eq(reviews.token, token))
    .limit(1)
    .all()[0];
  if (!row) {
    return { ok: false, kind: 'not_found' };
  }

  // 2. Idempotency: a submitted review cannot be re-submitted. The customer
  //    UI hides the form in this state, but a crafted POST could still hit
  //    the action.
  if (row.status === 'submitted') {
    return { ok: false, kind: 'already_submitted' };
  }

  // 3. Validate.
  const parsed = submitInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'invalid_input',
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  const { rating, reviewText } = parsed.data;

  // 4. Load site_config once — we need the auto-publish thresholds below.
  const cfg = db.select().from(siteConfig).limit(1).all()[0];
  const minRatingForPublish = cfg?.minRatingForAutoPublish ?? 4;
  const autoPublishEnabled = (cfg?.autoPublishTopReviewPhotos ?? 1) === 1;

  // 5. DB writes in a single transaction: update review, insert photo rows,
  //    maybe insert site_photos rows for auto-publish.
  const nowIso = now.toISOString();
  let publishedCount = 0;

  const result = db.transaction((tx) => {
    // Re-check status under the lock to close the TOCTOU gap — two submits
    // in the same millisecond both pass the `status='pending'` read above
    // but only one should flip the row.
    const updated = tx
      .update(reviews)
      .set({
        status: 'submitted',
        rating,
        reviewText,
        submittedAt: nowIso,
      })
      .where(
        and(eq(reviews.id, row.id), eq(reviews.status, 'pending')),
      )
      .returning()
      .all();
    if (updated.length === 0) {
      // Another writer beat us — surface as already_submitted.
      return null;
    }

    // Insert review_photos rows for each uploaded file.
    for (const p of photos) {
      tx.insert(reviewPhotos)
        .values({
          reviewId: row.id,
          filePath: p.filePath,
          mimeType: p.mimeType,
          sizeBytes: p.sizeBytes,
          createdAt: nowIso,
        })
        .run();
    }

    // 6. Auto-publish rule (STACK.md § Reviews → Auto-publish rule):
    //    rating >= min AND autoPublishEnabled AND photos.length > 0
    const shouldPublish =
      rating >= minRatingForPublish &&
      autoPublishEnabled &&
      photos.length > 0;

    if (shouldPublish) {
      // Append to the gallery — compute the current max sort_order once, then
      // assign subsequent photos strictly-increasing values.
      const maxRow = tx
        .select({
          maxSort: sql<number>`COALESCE(MAX(${sitePhotos.sortOrder}), -1)`,
        })
        .from(sitePhotos)
        .all()[0];
      let nextSort = (maxRow?.maxSort ?? -1) + 1;
      for (const p of photos) {
        tx.insert(sitePhotos)
          .values({
            filePath: p.filePath,
            // Carry the customer's review text as the gallery caption so
            // visitors see the written feedback alongside each promoted photo.
            caption: reviewText ?? null,
            sortOrder: nextSort,
            active: 1,
            sourceReviewId: row.id,
            // Snapshot the star rating so the gallery can display it without
            // a join. Rating is always non-null at submit time (Zod enforces
            // min 1 max 5), but the column is nullable for historical rows.
            sourceReviewRating: rating,
            createdAt: nowIso,
          })
          .run();
        nextSort += 1;
        publishedCount += 1;
      }
    }

    return updated[0];
  });

  if (result === null) {
    return { ok: false, kind: 'already_submitted' };
  }

  return {
    ok: true,
    review: result,
    autoPublished: publishedCount > 0,
    publishedPhotoCount: publishedCount,
  };
}
