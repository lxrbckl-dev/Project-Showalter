'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { reviews } from '@/db/schema/reviews';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { customers } from '@/db/schema/customers';
import { notifications } from '@/db/schema/notifications';
import { sendPushToAllAdmins } from '@/server/notifications/push';
import { upload } from '@/features/uploads/upload';
import { submitReviewCore, type UploadedPhoto } from './submit-core';

/**
 * Customer review submit — Phase 9.
 *
 * Entry point for the public /review/<token> form. Responsibilities split
 * between this wrapper and the pure core:
 *
 *   Wrapper (this file):
 *     - Resolve the review row and ensure it's still pending (fast-path).
 *       A second check inside the core's transaction closes the TOCTOU
 *       gap; this one is just to avoid doing file I/O for a no-op.
 *     - Run the Phase 3C upload pipeline per file (EXIF-stripped,
 *       magic-byte validated, size-capped from site_config).
 *     - Hand off the validated (token, input, photos[]) tuple to the
 *       pure core for the DB mutation + auto-publish copy.
 *     - On success: insert a Sawyer-inbox notification, fan out Web Push,
 *       and revalidate the affected paths.
 *
 *   Core (submit-core.ts):
 *     - Zod-validate rating + text.
 *     - Mutate reviews (pending → submitted) under an optimistic predicate.
 *     - Insert review_photos rows.
 *     - Apply the auto-publish rule (rating >= cfg.min_rating_for_auto_publish
 *       AND cfg.auto_publish_top_review_photos = 1) — copies photos into
 *       site_photos with source_review_id set.
 */

export type SubmitActionResult =
  | {
      ok: true;
      autoPublished: boolean;
      publishedPhotoCount: number;
    }
  | { ok: false; error: string };

export async function submitReview(
  token: string,
  formData: FormData,
): Promise<SubmitActionResult> {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Invalid review link.' };
  }

  const db = getDb();

  // Fast-path: reject if the review is unknown or already submitted, so we
  // don't burn disk writes on doomed submissions. The core re-verifies
  // under the transaction.
  const row = db
    .select()
    .from(reviews)
    .where(eq(reviews.token, token))
    .limit(1)
    .all()[0];
  if (!row) {
    return { ok: false, error: 'That review link is no longer valid.' };
  }
  if (row.status === 'submitted') {
    return { ok: false, error: 'Thanks — this review has already been submitted.' };
  }

  // Parse form fields.
  const ratingRaw = formData.get('rating');
  const rating = typeof ratingRaw === 'string' ? Number.parseInt(ratingRaw, 10) : NaN;
  const reviewText =
    typeof formData.get('reviewText') === 'string'
      ? (formData.get('reviewText') as string)
      : '';

  // Per STACK.md § Reviews: photo caps mirror booking attachment caps.
  const cfg = db.select().from(siteConfigTable).limit(1).all()[0];
  const maxPhotos = cfg?.maxBookingPhotos ?? 3;
  const maxBytes = cfg?.bookingPhotoMaxBytes ?? 10_485_760;

  const files = formData
    .getAll('photos')
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (files.length > maxPhotos) {
    return {
      ok: false,
      error: `Too many photos — max ${maxPhotos} allowed.`,
    };
  }

  const uploaded: UploadedPhoto[] = [];
  for (const f of files) {
    try {
      const u = await upload(f, {
        subdir: `reviews/${row.id}`,
        maxBytes,
      });
      uploaded.push({
        filePath: u.filePath,
        mimeType: u.mimeType,
        sizeBytes: u.sizeBytes,
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Photo upload failed.',
      };
    }
  }

  const core = submitReviewCore({
    token,
    input: { rating, reviewText },
    photos: uploaded,
    db,
  });

  if (!core.ok) {
    if (core.kind === 'not_found') {
      return { ok: false, error: 'That review link is no longer valid.' };
    }
    if (core.kind === 'already_submitted') {
      return {
        ok: false,
        error: 'Thanks — this review has already been submitted.',
      };
    }
    // invalid_input
    return {
      ok: false,
      error: core.errors[0] ?? 'Please fix the highlighted fields.',
    };
  }

  // Best-effort notify Sawyer: insert an in-app notification + fan out push.
  try {
    const customerRow = db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, core.review.customerId))
      .limit(1)
      .all()[0];
    const customerName = customerRow?.name ?? 'A customer';
    const stars = '★'.repeat(core.review.rating ?? 0);

    db.insert(notifications)
      .values({
        kind: 'review_submitted',
        payloadJson: JSON.stringify({
          reviewId: core.review.id,
          rating: core.review.rating,
          customerName,
          bookingId: core.review.bookingId ?? 'standalone',
          autoPublished: core.autoPublished,
          publishedPhotoCount: core.publishedPhotoCount,
        }),
        read: 0,
        createdAt: new Date().toISOString(),
        bookingId: core.review.bookingId ?? null,
      })
      .run();

    try {
      await sendPushToAllAdmins({
        title: `${stars || 'New review'} from ${customerName}`,
        body: core.autoPublished
          ? `Review submitted (${core.publishedPhotoCount} photo${core.publishedPhotoCount === 1 ? '' : 's'} auto-published)`
          : 'Review submitted',
        url: `/admin/reviews/${core.review.id}`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'warn',
          msg: 'review: push fan-out failed',
          reviewId: core.review.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  } catch (err) {
    // Never fail the submission because a notification write failed — the
    // review is already committed.
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'warn',
        msg: 'review: notification write failed',
        reviewId: core.review.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  try {
    revalidatePath('/');
    revalidatePath('/admin/reviews');
    revalidatePath(`/admin/reviews/${core.review.id}`);
    revalidatePath(`/review/${token}`);
  } catch {
    // Non-request contexts (tests) — ignore.
  }

  return {
    ok: true,
    autoPublished: core.autoPublished,
    publishedPhotoCount: core.publishedPhotoCount,
  };
}
