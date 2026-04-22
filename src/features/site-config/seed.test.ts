import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/db/test-helpers';
import * as schema from '@/db/schema';
import { seedFromBrief } from './seed';

describe('seedFromBrief()', () => {
  it('does nothing when SEED_FROM_BRIEF is not "true"', () => {
    const { db, cleanup } = createTestDb({ inMemory: true });

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
      cleanup();
    }
  });

  it('seeds personal data and services when flag is true and tables are empty', () => {
    const { db, cleanup } = createTestDb({ inMemory: true });

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
      cleanup();
    }
  });

  it('is idempotent — second call with flag true makes no changes', () => {
    const { db, cleanup } = createTestDb({ inMemory: true });

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
      cleanup();
    }
  });
});
