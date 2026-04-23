'use client';

/**
 * Outstanding invites table. Status-driven actions per row:
 *
 *   pending  → Copy link + Revoke
 *   used     → show "Used by {email} at {date}" (no actions)
 *   expired  → show "Expired {when}" (clear from UI is out of MVP — kept
 *              visible so admins don't re-issue blindly)
 *   revoked  → show "Revoked {when}"
 */

import { Badge } from '@/components/ui/badge';
import { buildInviteUrl, type InviteView } from '@/features/auth/invites-shared';
import { CopyInviteButton } from './CopyInviteButton';
import { RevokeButton } from './RevokeButton';

type Props = {
  invites: InviteView[];
  baseUrl: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: InviteView['status']) {
  switch (status) {
    case 'pending':
      return <Badge data-testid="invite-status-pending">Pending</Badge>;
    case 'used':
      return (
        <Badge variant="secondary" data-testid="invite-status-used">
          Used
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="secondary" data-testid="invite-status-expired">
          Expired
        </Badge>
      );
    case 'revoked':
      return (
        <Badge variant="secondary" data-testid="invite-status-revoked">
          Revoked
        </Badge>
      );
  }
}

export function InvitesList({ invites, baseUrl }: Props) {
  if (invites.length === 0) {
    return (
      <p
        className="rounded-md border border-dashed border-[hsl(var(--border))] px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]"
        data-testid="invites-empty"
      >
        No invites yet.
      </p>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-[hsl(var(--border))]"
      data-testid="invites-table"
    >
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--muted))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          <tr>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Label</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2 font-medium">Invited by</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => {
            const url = buildInviteUrl(invite.token, baseUrl);
            return (
              <tr
                key={invite.id}
                className="border-t border-[hsl(var(--border))]"
                data-testid="invite-row"
                data-token={invite.token}
                data-status={invite.status}
              >
                <td className="px-4 py-3 font-medium">{invite.invitedEmail}</td>
                <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                  {invite.label ?? '—'}
                </td>
                <td className="px-4 py-3">{statusBadge(invite.status)}</td>
                <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                  {invite.status === 'used'
                    ? `Used ${formatDate(invite.usedAt)}${invite.usedByEmail ? ` by ${invite.usedByEmail}` : ''}`
                    : invite.status === 'revoked'
                      ? `Revoked ${formatDate(invite.revokedAt)}`
                      : formatDate(invite.expiresAt)}
                </td>
                <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                  {invite.createdByEmail ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {invite.status === 'pending' ? (
                    <div className="flex justify-end gap-2">
                      <CopyInviteButton url={url} />
                      <RevokeButton token={invite.token} />
                    </div>
                  ) : (
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
