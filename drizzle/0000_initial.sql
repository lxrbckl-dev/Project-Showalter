-- Phase 0 initial migration.
-- Creates the single-row `site_config` table and seeds one row with all
-- non-personal defaults. Personal fields (phone/email/tiktok/bio/hero) stay
-- NULL until Phase 2's SEED_FROM_BRIEF populates them.
--
-- SQLite has no native BOOLEAN; 0/1 INTEGERs stand in for false/true.

CREATE TABLE `site_config` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,

    `phone` TEXT,
    `email` TEXT,
    `tiktok_url` TEXT,
    `bio` TEXT,
    `hero_image_path` TEXT,

    `sms_template` TEXT,

    `booking_horizon_weeks` INTEGER NOT NULL DEFAULT 4,
    `min_advance_notice_hours` INTEGER NOT NULL DEFAULT 36,
    `start_time_increment_minutes` INTEGER NOT NULL DEFAULT 30,
    `booking_spacing_minutes` INTEGER NOT NULL DEFAULT 60,
    `max_booking_photos` INTEGER NOT NULL DEFAULT 3,
    `booking_photo_max_bytes` INTEGER NOT NULL DEFAULT 10485760,
    `photo_retention_days_after_resolve` INTEGER NOT NULL DEFAULT 30,

    `timezone` TEXT NOT NULL DEFAULT 'America/Chicago',
    `business_founded_year` INTEGER NOT NULL DEFAULT 2023,

    `show_landing_stats` INTEGER NOT NULL DEFAULT 1,
    `min_reviews_for_landing_stats` INTEGER NOT NULL DEFAULT 3,
    `min_rating_for_auto_publish` INTEGER NOT NULL DEFAULT 4,
    `auto_publish_top_review_photos` INTEGER NOT NULL DEFAULT 1,

    `template_confirmation_email` TEXT,
    `template_confirmation_sms` TEXT,
    `template_decline_email` TEXT,
    `template_decline_sms` TEXT,
    `template_review_request_email` TEXT,
    `template_review_request_sms` TEXT
);

-- Seed the single row with all non-personal defaults + the six shipped
-- message-template bodies (verbatim from STACK.md § Message templates) and
-- the buried-SMS fallback template.
--
-- Note: SQL single-quotes are doubled inside string literals (e.g. `I''m`).
INSERT INTO `site_config` (
    `sms_template`,
    `booking_horizon_weeks`,
    `min_advance_notice_hours`,
    `start_time_increment_minutes`,
    `booking_spacing_minutes`,
    `max_booking_photos`,
    `booking_photo_max_bytes`,
    `photo_retention_days_after_resolve`,
    `timezone`,
    `business_founded_year`,
    `show_landing_stats`,
    `min_reviews_for_landing_stats`,
    `min_rating_for_auto_publish`,
    `auto_publish_top_review_photos`,
    `template_confirmation_email`,
    `template_confirmation_sms`,
    `template_decline_email`,
    `template_decline_sms`,
    `template_review_request_email`,
    `template_review_request_sms`
) VALUES (
    'Hi, this is [name here]. I''m interested in your services.' || char(10) || char(10) ||
      '• Address:' || char(10) ||
      '• Type of service:' || char(10) ||
      '• Yard size:' || char(10) ||
      '• Preferred date:' || char(10) || char(10) ||
      'Thanks!',
    4,
    36,
    30,
    60,
    3,
    10485760,
    30,
    'America/Chicago',
    2023,
    1,
    3,
    4,
    1,
    -- template_confirmation_email
    'Hi [name],' || char(10) || char(10) ||
      'Confirming your appointment:' || char(10) || char(10) ||
      '• Service: [service]' || char(10) ||
      '• Date: [date]' || char(10) ||
      '• Time: [time]' || char(10) ||
      '• Address: [address]' || char(10) || char(10) ||
      'Add to calendar:' || char(10) ||
      '• Google: [google_link]' || char(10) ||
      '• Apple:  [ics_link]' || char(10) || char(10) ||
      '— Sawyer' || char(10) ||
      '913-309-7340',
    -- template_confirmation_sms
    'Hi [name], this is Sawyer — you''re confirmed for [service] on [date] at [time]. Reply here if anything changes. Add to calendar: [shortlink]',
    -- template_decline_email
    'Hi [name],' || char(10) || char(10) ||
      'Thanks for reaching out about [service] on [date]. Unfortunately I''m not able to take it on that day — if a different date works, feel free to submit another request!' || char(10) || char(10) ||
      '— Sawyer' || char(10) ||
      '913-309-7340',
    -- template_decline_sms
    'Hi [name], Sawyer here — can''t do [service] on [date], sorry! If another day works feel free to book again.',
    -- template_review_request_email
    'Hi [name],' || char(10) || char(10) ||
      'Thanks for letting me work on your [service] today! If you have a quick moment, I''d really appreciate a review — it helps a lot:' || char(10) || char(10) ||
      '[link]' || char(10) || char(10) ||
      '— Sawyer' || char(10) ||
      '913-309-7340',
    -- template_review_request_sms
    'Hi [name], thanks for the job today! If you have a sec, a quick review would mean a lot: [link] — Sawyer'
);
