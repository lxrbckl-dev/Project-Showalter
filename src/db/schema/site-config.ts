import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Single-row `site_config` table.
 *
 * Mirrors STACK.md's Data model → `site_config` section exactly. SQLite has no
 * native BOOLEAN, so flags are stored as INTEGER (0/1). The initial migration
 * at `drizzle/0000_initial.sql` creates this table AND inserts one row with
 * all non-personal defaults populated; personal fields (`phone`, `email`,
 * `tiktok_url`, `bio`, `hero_image_path`) remain NULL until Phase 2's
 * `SEED_FROM_BRIEF` populates them.
 *
 * Later phases will add the rest of the tables documented in STACK.md.
 */
export const siteConfig = sqliteTable('site_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Personal / contact — NULL until seeded
  phone: text('phone'),
  email: text('email'),
  tiktokUrl: text('tiktok_url'),
  bio: text('bio'),
  heroImagePath: text('hero_image_path'),

  // SMS fallback template (buried "text Sawyer" link on landing page)
  smsTemplate: text('sms_template'),

  // Booking-flow knobs
  bookingHorizonWeeks: integer('booking_horizon_weeks').notNull().default(4),
  minAdvanceNoticeHours: integer('min_advance_notice_hours').notNull().default(36),
  startTimeIncrementMinutes: integer('start_time_increment_minutes').notNull().default(30),
  bookingSpacingMinutes: integer('booking_spacing_minutes').notNull().default(60),
  maxBookingPhotos: integer('max_booking_photos').notNull().default(3),
  bookingPhotoMaxBytes: integer('booking_photo_max_bytes').notNull().default(10_485_760),
  photoRetentionDaysAfterResolve: integer('photo_retention_days_after_resolve')
    .notNull()
    .default(30),

  // Locale / business
  timezone: text('timezone').notNull().default('America/Chicago'),
  businessFoundedYear: integer('business_founded_year').notNull().default(2023),

  // Landing-stats / auto-publish (INTEGER 0/1 for boolean)
  showLandingStats: integer('show_landing_stats').notNull().default(1),
  minReviewsForLandingStats: integer('min_reviews_for_landing_stats').notNull().default(3),
  minRatingForAutoPublish: integer('min_rating_for_auto_publish').notNull().default(4),
  autoPublishTopReviewPhotos: integer('auto_publish_top_review_photos').notNull().default(1),

  // Message templates (six bodies, shipped with defaults)
  templateConfirmationEmail: text('template_confirmation_email'),
  templateConfirmationSms: text('template_confirmation_sms'),
  templateDeclineEmail: text('template_decline_email'),
  templateDeclineSms: text('template_decline_sms'),
  templateReviewRequestEmail: text('template_review_request_email'),
  templateReviewRequestSms: text('template_review_request_sms'),
});

export type SiteConfigRow = typeof siteConfig.$inferSelect;
export type NewSiteConfigRow = typeof siteConfig.$inferInsert;
