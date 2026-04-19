/**
 * One-off dev script: seed site_photos gallery from seed-assets/site-photos/.
 *
 * Run from the repo root with:
 *   SEED_FROM_BRIEF=true tsx scripts/seed-gallery-dev.ts
 *
 * Safe to run multiple times — idempotent (skips if site_photos already has rows).
 */
import { getDb } from '@/db';
import { seedFromBrief } from '@/features/site-config/seed';

const db = getDb();
seedFromBrief(db);
console.log('[seed-gallery-dev] done');
