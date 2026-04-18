/**
 * Standalone seed script invoked by tests/e2e/global-setup.ts via a tsx
 * subprocess. Runs the same migrate + reconcile steps that src/server/boot.ts
 * runs at server init — we do them here because Playwright's webServer uses
 * `next start` on a `output: 'standalone'` build where instrumentation.ts is
 * less reliable for preparing state before the first request lands.
 *
 * Expects DATABASE_URL + ADMIN_EMAILS in the environment.
 * Set SEED_FROM_BRIEF=true to also seed Sawyer's personal data + services
 * (phone, email, bio, tiktok, and the five brief services).
 */
import { migrate } from '@/db/migrate';
import { getDb } from '@/db';
import { reconcileAdmins } from '@/features/auth/reconcile';
import { seedFromBrief } from '@/features/site-config/seed';

async function main(): Promise<void> {
  migrate();

  const db = getDb();

  // Seed personal data + services when explicitly requested.
  // Idempotent: seedFromBrief guards on phone IS NULL and empty services table.
  seedFromBrief(db);

  const raw = process.env.ADMIN_EMAILS ?? '';
  const emailList = raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  await reconcileAdmins(db as Parameters<typeof reconcileAdmins>[0], emailList);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed-db failed:', err);
  process.exit(1);
});
