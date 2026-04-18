import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `review_photos` table — Phase 9.
 *
 * Customer-uploaded photos attached at review submission. Files themselves
 * live under `/data/uploads/reviews/<review_id>/` (written through the
 * shared `src/features/uploads/` pipeline — EXIF-stripped, magic-byte
 * validated, size-capped). The `file_path` column holds the path relative
 * to `/data/uploads` so it can be joined against `UPLOADS_ROOT` or served
 * through the /uploads route without re-encoding the base.
 *
 * Auto-publish rule (see STACK.md § Reviews → Auto-publish rule): when a
 * review enters `submitted` with rating >= `site_config.min_rating_for_auto_publish`
 * AND `auto_publish_top_review_photos = 1`, each review_photos row's
 * file_path is ALSO written into `site_photos` with `source_review_id` set
 * to the review's id. The underlying file stays in one location on disk
 * and is simply referenced from both tables.
 */
export const reviewPhotos = sqliteTable(
  'review_photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id').notNull(),
    /** Relative path under /data/uploads — e.g. reviews/42/<uuid>.jpg */
    filePath: text('file_path').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    reviewIdx: index('review_photos_review_idx').on(table.reviewId),
  }),
);

export type ReviewPhotoRow = typeof reviewPhotos.$inferSelect;
export type NewReviewPhotoRow = typeof reviewPhotos.$inferInsert;
