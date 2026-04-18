/**
 * admin:list — print a table of all admins with their status.
 *
 * Usage: pnpm admin:list
 *
 * Output columns: email, active, enrolled_at, device_count
 */

import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import { sql } from 'drizzle-orm';

async function main() {
  const db = getDb();

  const rows = db
    .select({
      email: admins.email,
      active: admins.active,
      enrolled_at: admins.enrolledAt,
      device_count: sql<number>`(
        SELECT COUNT(*) FROM credentials WHERE credentials.admin_id = ${admins.id}
      )`,
    })
    .from(admins)
    .all();

  if (rows.length === 0) {
    console.log('No admins found.');
    process.exit(0);
  }

  const formatted = rows.map((r) => ({
    email: r.email,
    active: r.active === 1 ? 'yes' : 'no',
    enrolled_at: r.enrolled_at ?? '(not enrolled)',
    device_count: r.device_count,
  }));

  console.table(formatted);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
