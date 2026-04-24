'use client';

/**
 * Current-admins table. Enable / disable buttons call server actions and
 * refresh the page. "You" badge appears on the session's own admin row;
 * the disable action is hidden on that row (and the server action rejects
 * it too — defense in depth).
 *
 * Layout: card stack on mobile (<md), table on desktop (md+).
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

/** Shared status badge — used by both mobile card and desktop table. */
function AdminStatusBadge({ admin }: { admin: AdminView }) {
  if (!admin.enrolledAt) return <Badge variant="secondary">Pending</Badge>;
  if (admin.active) return <Badge>Active</Badge>;
  return <Badge variant="secondary">Disabled</Badge>;
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
    <div data-testid="admins-table">
      {/* Mobile: card stack (hidden at md+) */}
      <div className="space-y-3 md:hidden">
        {admins.map((admin) => (
          <div
            key={admin.id}
            className="rounded-lg border border-[hsl(var(--border))] bg-white p-4 shadow-sm"
            data-testid="admin-row"
            data-admin-id={admin.id}
            data-active={admin.active ? 'true' : 'false'}
          >
            {/* Top line: email + "You" badge */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900">
                {admin.email ?? (
                  <span className="italic text-[hsl(var(--muted-foreground))]">
                    {admin.name ?? '(no email)'}
                  </span>
                )}
              </span>
              {admin.isCurrentAdmin && (
                <Badge data-testid="you-badge">You</Badge>
              )}
            </div>

            {/* Second line: status pill + added date */}
            <div className="mt-2 flex items-center justify-between">
              <AdminStatusBadge admin={admin} />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                Added {formatDate(admin.createdAt)}
              </span>
            </div>

            {/* Third line: device count */}
            <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {admin.deviceCount === 1
                ? '1 device'
                : `${admin.deviceCount} devices`}
            </div>

            {/* Action row */}
            <div className="mt-3">
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
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table (hidden below md) */}
      <div className="hidden overflow-hidden rounded-md border border-[hsl(var(--border))] md:block">
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
                  <span className="font-medium">
                    {admin.email ?? (
                      <span className="italic text-[hsl(var(--muted-foreground))]">
                        {admin.name ?? '(no email)'}
                      </span>
                    )}
                  </span>
                  {admin.isCurrentAdmin && (
                    <Badge className="ml-2" data-testid="you-badge">
                      You
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge admin={admin} />
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

      {/* Error banner visible in both layouts */}
      {error && (
        <p
          className="mt-2 rounded-md border border-[hsl(var(--border))] px-4 py-2 text-xs text-[hsl(var(--destructive))] md:hidden"
          role="alert"
          data-testid="admins-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
