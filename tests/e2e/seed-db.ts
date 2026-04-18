/**
 * Standalone seed script invoked by tests/e2e/global-setup.ts via a tsx
 * subprocess. Runs the same migrate + reconcile steps that src/server/boot.ts
 * runs at server init — we do them here because Playwright's webServer uses
 * `next start` on a `output: 'standalone'` build where instrumentation.ts is
 * less reliable for preparing state before the first request lands.
 *
 * Expects DATABASE_URL + ADMIN_EMAILS in the environment.
 */
import { migrate } from '@/db/migrate';
import { getDb } from '@/db';
import { reconcileAdmins } from '@/features/auth/reconcile';

async function main(): Promise<void> {
  migrate();

  const raw = process.env.ADMIN_EMAILS ?? '';
  const emailList = raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const db = getDb() as Parameters<typeof reconcileAdmins>[0];
  await reconcileAdmins(db, emailList);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed-db failed:', err);
  process.exit(1);
});
