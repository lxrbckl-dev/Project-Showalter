/**
 * admin:revoke-invite — revoke an outstanding admin invite by token prefix.
 *
 * Usage: pnpm admin:revoke-invite <token-prefix>
 *
 * Designed as the break-glass path in case the /admin/settings/admins UI is
 * unreachable (e.g. the last admin is locked out and hasn't regenerated a
 * passkey yet). Requires a minimum 6-character prefix; errors out
 * if the prefix matches more than one invite.
 *
 * Idempotent for already-revoked invites.
 */

import { getDb } from '@/db';
import {
  INVITE_TOKEN_PREFIX_MIN,
  findInviteByTokenPrefix,
  revokeInviteByToken,
} from '@/features/auth/invites-core';

async function main(): Promise<void> {
  const prefix = process.argv[2]?.trim();
  if (!prefix) {
    console.error('Usage: pnpm admin:revoke-invite <token-prefix>');
    process.exit(1);
  }

  if (prefix.length < INVITE_TOKEN_PREFIX_MIN) {
    console.error(
      `Token prefix must be at least ${INVITE_TOKEN_PREFIX_MIN} characters to avoid ambiguity.`,
    );
    process.exit(1);
  }

  const db = getDb();
  const found = findInviteByTokenPrefix(db, prefix);
  if (found.kind === 'none') {
    console.error(`No invite matches prefix "${prefix}".`);
    process.exit(1);
  }
  if (found.kind === 'ambiguous') {
    console.error(
      `Prefix "${prefix}" matches ${found.count} invites — add more characters to narrow the match.`,
    );
    process.exit(1);
  }

  const res = revokeInviteByToken(db, found.row.token);
  if (!res.ok) {
    console.error(`Could not revoke invite: ${res.reason}`);
    process.exit(1);
  }

  console.log(
    `Revoked invite for ${found.row.invitedEmail} (token ${found.row.token.slice(0, 8)}…).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
