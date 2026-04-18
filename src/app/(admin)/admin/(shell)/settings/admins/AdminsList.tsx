'use client';

/**
 * Current-admins table. Enable / disable buttons call server actions and
 * refresh the page. "You" badge appears on the session's own admin row;
 * the disable action is hidden on that row (and the server action rejects
 * it too — defense in depth).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  disableAdmin,
  enableAdmin,
  type AdminView,
} from '@/features/auth/admin-management';

type Props = {
  admins: AdminView[];
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function AdminsList({ admins }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (admins.length === 0) {
    return (
      <p
        className="rounded-md border border-dashed border-[hsl(var(--border))] px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]"
        data-testid="admins-empty"
      >
        No admins yet.
      </p>
    );
  }

  async function handleToggle(admin: AdminView) {
    if (busyId !== null) return;
    setBusyId(admin.id);
    setError(null);
    try {
      const res = admin.active
        ? await disableAdmin(admin.id)
        : await enableAdmin(admin.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-[hsl(var(--border))]"
      data-testid="admins-table"
    >
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--muted))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          <tr>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Added</th>
            <th className="px-4 py-2 font-medium">Devices</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((admin) => (
            <tr
              key={admin.id}
              className="border-t border-[hsl(var(--border))]"
              data-testid="admin-row"
              data-admin-id={admin.id}
              data-active={admin.active ? 'true' : 'false'}
            >
              <td className="px-4 py-3">
                <span className="font-medium">{admin.email}</span>
                {admin.isCurrentAdmin && (
                  <Badge className="ml-2" data-testid="you-badge">
                    You
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3">
                {!admin.enrolledAt ? (
                  <Badge variant="secondary">Pending</Badge>
                ) : admin.active ? (
                  <Badge>Active</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                {formatDate(admin.createdAt)}
              </td>
              <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                {admin.deviceCount}
              </td>
              <td className="px-4 py-3 text-right">
                {admin.isCurrentAdmin ? (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    Use Sign out in the header
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(admin)}
                    disabled={busyId === admin.id}
                    data-testid="toggle-admin-button"
                  >
                    {admin.active ? 'Disable' : 'Enable'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <p
          className="border-t border-[hsl(var(--border))] px-4 py-2 text-xs text-[hsl(var(--destructive))]"
          role="alert"
          data-testid="admins-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
