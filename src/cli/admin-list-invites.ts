/**
 * admin:list-invites — print every admin invite with derived status.
 *
 * Usage: pnpm admin:list-invites
 *
 * Output columns: token_prefix (first 8 chars), invited_email, status, label,
 * expires_at, invited_by.
 *
 * Token is deliberately truncated — the full URL shouldn't be printed to
 * a terminal (leaks to scrollback + history). Use the admin UI if you need
 * to re-send the full link; the prefix is enough for `admin:revoke-invite`.
 */

import { getDb } from '@/db';
import { listInvites } from '@/features/auth/invites-core';

async function main(): Promise<void> {
  const invites = listInvites(getDb());
  if (invites.length === 0) {
    console.log('No invites found.');
    process.exit(0);
  }

  const formatted = invites.map((inv) => ({
    token_prefix: inv.token.slice(0, 8),
    email: inv.invitedEmail,
    status: inv.status,
    label: inv.label ?? '',
    expires_at: inv.expiresAt,
    invited_by: inv.createdByEmail ?? '(unknown)',
  }));

  // eslint-disable-next-line no-console
  console.table(formatted);
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
