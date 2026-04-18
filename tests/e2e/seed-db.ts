/**
 * Standalone seed script invoked by tests/e2e/global-setup.ts via a tsx
 * subprocess. Runs the same migrate + seed steps that src/server/boot.ts
 * runs at server init — we do them here because Playwright's webServer uses
 * a standalone build where instrumentation.ts is less reliable for preparing
 * state before the first request lands.
 *
 * Admins are NOT seeded here — since #83 the `admins` table starts empty on
 * a fresh DB and the founding-admin flow at /admin/login seeds the first
 * row the moment a test visits that page. Specs that need a pre-existing
 * admin do their own priming via dedicated tsx helpers.
 *
 * Expects DATABASE_URL in the environment.
 * Set SEED_FROM_BRIEF=true to also seed Sawyer's personal data + services
 * (phone, email, bio, tiktok, and the five brief services).
 */
import { migrate } from '@/db/migrate';
import { getDb } from '@/db';
import { seedFromBrief } from '@/features/site-config/seed';

async function main(): Promise<void> {
  migrate();

  const db = getDb();

  // Seed personal data + services when explicitly requested.
  // Idempotent: seedFromBrief guards on phone IS NULL and empty services table.
  seedFromBrief(db);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed-db failed:', err);
  process.exit(1);
});
