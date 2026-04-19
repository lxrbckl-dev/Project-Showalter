import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `site_photos` table — Phase 3C.
 *
 * Stores gallery images and (Phase 9) review-auto-promoted photos rendered on
 * the public landing page. All file writes go through `src/features/uploads/`
 * so EXIF stripping and MIME validation are applied uniformly.
 *
 * Phase 5 note: `booking_attachments` uses the same upload infrastructure but
 * its own table. This table is for site-visible photos only.
 *
 * Phase 9 note: `source_review_id` will gain a real FK constraint against
 * `reviews(id)` once that table exists. For now the column stores the raw
 * INTEGER so data is already there when Phase 9 runs its migration.
 */
export const sitePhotos = sqliteTable('site_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** Relative path under /data/uploads — e.g. site/gallery/<uuid>.webp */
  filePath: text('file_path').notNull(),

  caption: text('caption'),

  /** Lower = displayed first. Admin can drag-reorder. */
  sortOrder: integer('sort_order').notNull().default(0),

  /**
   * Soft-archive flag. 1 = visible on public site; 0 = hidden.
   * Never hard-deleted.
   */
  active: integer('active').notNull().default(1),

  /**
   * Future FK → reviews(id). Wired as a real FK constraint in Phase 9.
   * Null for manually-uploaded gallery photos.
   */
  sourceReviewId: integer('source_review_id'),

  /**
   * Star rating snapshot (1-5) from the source review, for display next to
   * the caption on the public Reviews marquee. Nullable — only set when the
   * photo was auto-published from a review (source_review_id IS NOT NULL).
   * Admin-uploaded photos keep this NULL and render no rating.
   */
  sourceReviewRating: integer('source_review_rating'),

  createdAt: text('created_at').notNull(),
});

export type SitePhotoRow = typeof sitePhotos.$inferSelect;
export type NewSitePhotoRow = typeof sitePhotos.$inferInsert;
