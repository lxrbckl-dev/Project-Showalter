import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { seedFromBrief } from './seed';

/**
 * Creates an isolated in-memory database with migrations applied.
 * We monkey-patch the module-level singletons in @/db to point at the
 * in-memory DB so that migrate() and seedFromBrief() share the same
 * connection.
 *
 * Each test gets a fresh DB via beforeEach.
 */
function makeTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

describe('seedFromBrief()', () => {
  it('does nothing when SEED_FROM_BRIEF is not "true"', () => {
    const { sqlite, db } = makeTestDb();

    // Apply migrations manually
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE site_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT,
        hero_image_path TEXT, date_of_birth TEXT, sms_template TEXT,
        booking_horizon_weeks INTEGER NOT NULL DEFAULT 4,
        min_advance_notice_hours INTEGER NOT NULL DEFAULT 36,
        start_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
        booking_spacing_minutes INTEGER NOT NULL DEFAULT 60,
        max_booking_photos INTEGER NOT NULL DEFAULT 3,
        booking_photo_max_bytes INTEGER NOT NULL DEFAULT 10485760,
        photo_retention_days_after_resolve INTEGER NOT NULL DEFAULT 30,
        timezone TEXT NOT NULL DEFAULT 'America/Chicago',
        business_founded_year INTEGER NOT NULL DEFAULT 2023,
        site_title TEXT NOT NULL DEFAULT 'Sawyer Showalter Service',
        show_landing_stats INTEGER NOT NULL DEFAULT 1,
        min_reviews_for_landing_stats INTEGER NOT NULL DEFAULT 3,
        min_rating_for_auto_publish INTEGER NOT NULL DEFAULT 4,
        auto_publish_top_review_photos INTEGER NOT NULL DEFAULT 1,
        template_confirmation_email TEXT,
        template_confirmation_sms TEXT,
        template_decline_email TEXT,
        template_decline_sms TEXT,
        template_review_request_email TEXT,
        template_review_request_sms TEXT
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price_cents INTEGER,
        price_suffix TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO site_config (timezone) VALUES ('America/Chicago');
    `);

    const originalEnv = process.env.SEED_FROM_BRIEF;
    delete process.env.SEED_FROM_BRIEF;

    try {
      seedFromBrief(db as unknown as ReturnType<typeof import('@/db').getDb>);

      const config = db.select({ phone: schema.siteConfig.phone }).from(schema.siteConfig).all();
      expect(config[0].phone).toBeNull();

      const serviceRows = db.select({ id: schema.services.id }).from(schema.services).all();
      expect(serviceRows).toHaveLength(0);
    } finally {
      process.env.SEED_FROM_BRIEF = originalEnv;
      sqlite.close();
    }
  });

  it('seeds personal data and services when flag is true and tables are empty', () => {
    const { sqlite, db } = makeTestDb();

    sqlite.exec(`
      CREATE TABLE site_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT,
        hero_image_path TEXT, date_of_birth TEXT, sms_template TEXT,
        booking_horizon_weeks INTEGER NOT NULL DEFAULT 4,
        min_advance_notice_hours INTEGER NOT NULL DEFAULT 36,
        start_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
        booking_spacing_minutes INTEGER NOT NULL DEFAULT 60,
        max_booking_photos INTEGER NOT NULL DEFAULT 3,
        booking_photo_max_bytes INTEGER NOT NULL DEFAULT 10485760,
        photo_retention_days_after_resolve INTEGER NOT NULL DEFAULT 30,
        timezone TEXT NOT NULL DEFAULT 'America/Chicago',
        business_founded_year INTEGER NOT NULL DEFAULT 2023,
        site_title TEXT NOT NULL DEFAULT 'Sawyer Showalter Service',
        show_landing_stats INTEGER NOT NULL DEFAULT 1,
        min_reviews_for_landing_stats INTEGER NOT NULL DEFAULT 3,
        min_rating_for_auto_publish INTEGER NOT NULL DEFAULT 4,
        auto_publish_top_review_photos INTEGER NOT NULL DEFAULT 1,
        template_confirmation_email TEXT,
        template_confirmation_sms TEXT,
        template_decline_email TEXT,
        template_decline_sms TEXT,
        template_review_request_email TEXT,
        template_review_request_sms TEXT
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price_cents INTEGER,
        price_suffix TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO site_config (timezone) VALUES ('America/Chicago');
    `);

    const originalEnv = process.env.SEED_FROM_BRIEF;
    process.env.SEED_FROM_BRIEF = 'true';

    try {
      seedFromBrief(db as unknown as ReturnType<typeof import('@/db').getDb>);

      const config = db
        .select({
          phone: schema.siteConfig.phone,
          email: schema.siteConfig.email,
          bio: schema.siteConfig.bio,
        })
        .from(schema.siteConfig)
        .all();

      expect(config[0].phone).toBe('+19133097340');
      expect(config[0].email).toBe('sshowalterservices@gmail.com');
      expect(config[0].bio).toContain('Sawyer Showalter');
      // Bio uses the [age] placeholder — no hardcoded age literal
      expect(config[0].bio).toContain('[age]');
      expect(config[0].bio).not.toMatch(/\b15\s+year\s+old\b/i);

      const serviceRows = db.select().from(schema.services).all();
      expect(serviceRows).toHaveLength(5);
      expect(serviceRows[0].name).toBe('Trash Can Cleaning');
      expect(serviceRows[4].name).toBe('Snow removal');
      expect(serviceRows[4].priceCents).toBeNull();
    } finally {
      process.env.SEED_FROM_BRIEF = originalEnv;
      sqlite.close();
    }
  });

  it('is idempotent — second call with flag true makes no changes', () => {
    const { sqlite, db } = makeTestDb();

    sqlite.exec(`
      CREATE TABLE site_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        phone TEXT, email TEXT, tiktok_url TEXT, bio TEXT,
        hero_image_path TEXT, date_of_birth TEXT, sms_template TEXT,
        booking_horizon_weeks INTEGER NOT NULL DEFAULT 4,
        min_advance_notice_hours INTEGER NOT NULL DEFAULT 36,
        start_time_increment_minutes INTEGER NOT NULL DEFAULT 30,
        booking_spacing_minutes INTEGER NOT NULL DEFAULT 60,
        max_booking_photos INTEGER NOT NULL DEFAULT 3,
        booking_photo_max_bytes INTEGER NOT NULL DEFAULT 10485760,
        photo_retention_days_after_resolve INTEGER NOT NULL DEFAULT 30,
        timezone TEXT NOT NULL DEFAULT 'America/Chicago',
        business_founded_year INTEGER NOT NULL DEFAULT 2023,
        site_title TEXT NOT NULL DEFAULT 'Sawyer Showalter Service',
        show_landing_stats INTEGER NOT NULL DEFAULT 1,
        min_reviews_for_landing_stats INTEGER NOT NULL DEFAULT 3,
        min_rating_for_auto_publish INTEGER NOT NULL DEFAULT 4,
        auto_publish_top_review_photos INTEGER NOT NULL DEFAULT 1,
        template_confirmation_email TEXT,
        template_confirmation_sms TEXT,
        template_decline_email TEXT,
        template_decline_sms TEXT,
        template_review_request_email TEXT,
        template_review_request_sms TEXT
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price_cents INTEGER,
        price_suffix TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO site_config (timezone) VALUES ('America/Chicago');
    `);

    const originalEnv = process.env.SEED_FROM_BRIEF;
    process.env.SEED_FROM_BRIEF = 'true';

    try {
      const typedDb = db as unknown as ReturnType<typeof import('@/db').getDb>;
      seedFromBrief(typedDb);
      seedFromBrief(typedDb); // second call — must be a no-op

      const serviceRows = db.select().from(schema.services).all();
      // Still exactly 5 rows — no duplicates
      expect(serviceRows).toHaveLength(5);

      const config = db.select({ phone: schema.siteConfig.phone }).from(schema.siteConfig).all();
      // Phone still set, not doubled-up
      expect(config[0].phone).toBe('+19133097340');
    } finally {
      process.env.SEED_FROM_BRIEF = originalEnv;
      sqlite.close();
    }
  });
});
