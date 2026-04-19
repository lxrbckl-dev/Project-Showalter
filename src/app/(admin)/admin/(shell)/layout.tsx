/**
 * Admin shell — route-group layout for every `/admin/*` page EXCEPT the
 * login page. The login page lives under `/admin/login/layout.tsx` with a
 * minimal chrome-free layout so the auth gate can't render before the user
 * has authenticated.
 *
 * Phase 6 additions:
 *   - "Inbox" + "Notifications" nav entries
 *   - Header unread-notifications badge (reads `unreadCount` from the
 *     notifications feature)
 *   - Small stats strip under the nav surfacing "Pending: N" and
 *     "Confirmed this week: N" (see STACK.md § Admin dashboard header strip)
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/features/auth/auth';
import { getDb } from '@/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { unreadCount } from '@/features/notifications/queries';
import { getHeaderStats } from '@/features/bookings/admin-queries';
import { logoutAction } from './actions';

export const dynamic = 'force-dynamic';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/inbox', label: 'Inbox' },
  { href: '/admin/bookings/new', label: 'New booking' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/index-book', label: 'Index Book' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session) redirect('/admin/login');

  const email = session.user.email;
  const db = getDb();

  // Header surface reads are cheap — two count queries + a join-lite fetch.
  // If this ever gets hot, swap to a 60-second memoized cache.
  let unread = 0;
  let stats = { pending: 0, confirmedThisWeek: 0 };
  try {
    unread = unreadCount(db);
    stats = getHeaderStats(db);
  } catch {
    // Boot-time race (tables not yet created in a fresh dev DB) — render zeroes.
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label="Showalter Admin">
              <Image
                src="/logo_primary.png"
                alt="Showalter Admin"
                width={120}
                height={120}
                className="h-auto w-auto max-h-[120px]"
                priority
              />
            </Link>
            <Link
              href="/admin/notifications"
              aria-label={`${unread} unread notifications`}
              data-testid="unread-badge-link"
            >
              <Badge
                variant={unread > 0 ? 'default' : 'secondary'}
                data-testid="unread-badge"
                data-unread={unread}
              >
                {unread}
              </Badge>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-sm text-[hsl(var(--muted-foreground))]"
              data-testid="signed-in-email"
            >
              {email}
            </span>
            <form action={logoutAction}>
              <Button type="submit" size="sm" variant="outline">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <nav className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <ul className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-6 py-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block whitespace-nowrap px-3 py-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div
        className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/50"
        data-testid="header-stats"
      >
        <div className="mx-auto flex max-w-6xl gap-6 px-6 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span data-testid="stats-pending">
            Pending: <strong data-testid="stats-pending-count" className="text-[hsl(var(--foreground))]">{stats.pending}</strong>
          </span>
          <span data-testid="stats-confirmed-week">
            Confirmed this week:{' '}
            <strong data-testid="stats-confirmed-count" className="text-[hsl(var(--foreground))]">{stats.confirmedThisWeek}</strong>
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
