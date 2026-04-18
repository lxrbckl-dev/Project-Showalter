import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `booking_attachments` table — Phase 5.
 *
 * Customer-uploaded photos attached at booking submission. Files themselves
 * live under `/data/uploads/bookings/<booking_id>/` (written through the
 * shared `src/features/uploads/` pipeline — EXIF-stripped, magic-byte
 * validated). `file_path` is stored relative to `/data/uploads` so it can be
 * joined against `UPLOADS_ROOT` at read time without re-encoding the base.
 */
export const bookingAttachments = sqliteTable(
  'booking_attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookingId: integer('booking_id').notNull(),
    /** Relative path under /data/uploads — e.g. bookings/42/<uuid>.jpg */
    filePath: text('file_path').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    bookingIdx: index('booking_attachments_booking_idx').on(table.bookingId),
  }),
);

export type BookingAttachmentRow = typeof bookingAttachments.$inferSelect;
export type NewBookingAttachmentRow = typeof bookingAttachments.$inferInsert;
