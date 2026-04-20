import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Single-row `site_config` table.
 *
 * Mirrors STACK.md's Data model → `site_config` section exactly. SQLite has no
 * native BOOLEAN, so flags are stored as INTEGER (0/1). The initial migration
 * at `drizzle/0000_initial.sql` creates this table AND inserts one row with
 * all non-personal defaults populated; personal fields (`phone`, `email`,
 * `tiktok_url`, `bio`) remain NULL until Phase 2's `SEED_FROM_BRIEF`
 * populates them.
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

  /**
   * Sawyer's date of birth, stored as an ISO-8601 calendar date
   * (`YYYY-MM-DD`). Nullable — the field is optional and starts NULL on fresh
   * DBs until an admin sets it in the Content → Contact tab. Used by the
   * `[age]` template placeholder in `bio` so the age rendered on the landing
   * page stays current automatically (see `src/lib/age.ts`).
   */
  dateOfBirth: text('date_of_birth'),

  /**
   * First name of the site owner (e.g., "Sawyer"). Drives the "About {name}"
   * heading on the public page and may be used elsewhere for personalization.
   * Nullable — when unset, the public page falls back to the generic "About".
   * Admin-editable from Content → Contact.
   */
  ownerFirstName: text('owner_first_name'),

  // SMS fallback template (buried "text Sawyer" link on landing page)
  smsTemplate: text('sms_template'),

  /**
   * Prefilled subject line for the mailto link on the public Contact section.
   * Nullable — when unset, the email link opens with no subject.
   * Admin-editable from Content → Contact.
   */
  emailTemplateSubject: text('email_template_subject'),

  /**
   * Prefilled body for the mailto link on the public Contact section.
   * Nullable — when unset, the email link opens with no body.
   * Supports multiline content. Admin-editable from Content → Contact.
   */
  emailTemplateBody: text('email_template_body'),

  // Booking-flow knobs
  bookingHorizonWeeks: integer('booking_horizon_weeks').notNull().default(4),
  minAdvanceNoticeHours: integer('min_advance_notice_hours').notNull().default(36),
  startTimeIncrementMinutes: integer('start_time_increment_minutes').notNull().default(30),
  bookingSpacingMinutes: integer('booking_spacing_minutes').notNull().default(60),
  maxBookingPhotos: integer('max_booking_photos').notNull().default(3),
  bookingPhotoMaxBytes: integer('booking_photo_max_bytes').notNull().default(1_073_741_824),
  photoRetentionDaysAfterResolve: integer('photo_retention_days_after_resolve')
    .notNull()
    .default(30),

  // Locale / business
  timezone: text('timezone').notNull().default('America/Chicago'),
  businessFoundedYear: integer('business_founded_year').notNull().default(2023),

  /**
   * Admin "bonus" added to the auto-computed "Jobs Completed" stat on the
   * landing page. Used to credit pre-platform work that isn't tracked as
   * bookings. Nullable — when unset, the public site shows just the
   * computed count. Field name kept as `_override` for migration stability.
   */
  statsJobsCompletedOverride: integer('stats_jobs_completed_override'),

  /**
   * Admin "bonus" added to the auto-computed "Customers Served" stat on the
   * landing page. Same semantics as `statsJobsCompletedOverride` — credits
   * pre-platform customers. Nullable when no bonus applies.
   */
  statsCustomersServedOverride: integer('stats_customers_served_override'),

  /**
   * Admin-configurable business start date (ISO YYYY-MM-DD).
   * When set, "Years in Business" is derived from this date (more precise
   * than `businessFoundedYear` alone — accounts for the month/day of start).
   * Nullable — when unset, falls back to `businessFoundedYear` for the calc.
   */
  businessStartDate: text('business_start_date'),

  /**
   * Newline-delimited list of short, free-text facts about the host (e.g.
   * "Eagle Scout", "Born in Kansas City", "Mowing since age 12"). Rendered as
   * a continuously scrolling marquee on the public landing page, items
   * separated by a `•` bullet. Order is randomized on each request.
   * Nullable / empty → marquee renders nothing.
   */
  hostFacts: text('host_facts'),

  /**
   * Site title / business name shown in the public-facing UI (Hero eyebrow,
   * back-links, image alt text), SEO metadata (<title>, OG title, Twitter
   * card), and the dynamic Open Graph image. Admin-editable from Content →
   * Settings so Sawyer (or a future rebrand) can change the displayed name
   * without a redeploy.
   *
   * The Hero eyebrow uppercases the value via Tailwind — the stored form is
   * mixed-case so SEO titles and email subjects read naturally. Validated
   * 1–60 chars after trim in `src/features/site-config/actions.ts`.
   */
  siteTitle: text('site_title').notNull().default('Sawyer Showalter Service'),

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
  templateRescheduleEmail: text('template_reschedule_email'),
  templateRescheduleSms: text('template_reschedule_sms'),
});

export type SiteConfigRow = typeof siteConfig.$inferSelect;
export type NewSiteConfigRow = typeof siteConfig.$inferInsert;
