'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  markAllAsRead,
  markAsRead,
} from '@/features/notifications/actions';

/**
 * Small client-side wrappers for the mark-as-read server actions. Two
 * variants:
 *   - `kind="mark-one"` — renders a "Mark read" button for the single row.
 *   - `kind="mark-all"` — renders a "Mark all read" button for the page
 *                        header. Safe to click with zero unread rows; the
 *                        action is idempotent.
 */
export function NotificationRowControls({
  kind,
  ids,
}: {
  kind: 'mark-one' | 'mark-all';
  ids: readonly number[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(): void {
    startTransition(async () => {
      if (kind === 'mark-all') {
        await markAllAsRead();
      } else {
        await markAsRead([...ids]);
      }
      router.refresh();
    });
  }

  if (kind === 'mark-all') {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={run}
        data-testid="mark-all-read"
        className="rounded-md border border-[hsl(var(--border))] px-3 py-1 text-xs"
      >
        {isPending ? 'Marking…' : 'Mark all read'}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={run}
      data-testid={`mark-read-${ids[0] ?? 'none'}`}
      className="rounded-md bg-[hsl(var(--primary))] px-3 py-1 text-xs text-[hsl(var(--primary-foreground))] disabled:opacity-60"
    >
      {isPending ? 'Marking…' : 'Mark read'}
    </button>
  );
}
