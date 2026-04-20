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
import { unreadCount } from '@/features/notifications/queries';
import { AdminNav } from './_components/AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session) redirect('/admin/login');

  const db = getDb();

  let unread = 0;
  try {
    unread = unreadCount(db);
  } catch {
    // Boot-time race (notifications table not yet created in a fresh dev DB).
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Sticky chrome — header + tab nav stay pinned to the top of the
        viewport on scroll. `bg-[hsl(var(--card))]` on each strip keeps the
        underlying page content from showing through; `z-30` keeps it under
        the fixed save-bar in /admin/content (which uses z-40).
      */}
      <div className="sticky top-0 z-30">
        <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          {/* 3-column grid keeps the logo perfectly centered relative to
            the page no matter how wide the hamburger button is. The third
            column is an empty spacer balancing the hamburger so the logo
            stays optically dead-center. */}
          <div className="mx-auto grid max-w-6xl grid-cols-3 items-center px-6 py-4">
            <div className="justify-self-start">
              <AdminNav unread={unread} />
            </div>
            <Link
              href="/admin"
              aria-label="Showalter Admin"
              className="justify-self-center"
            >
              <Image
                src="/logo_primary.png"
                alt="Showalter Admin"
                width={120}
                height={120}
                className="h-auto w-auto max-h-[120px]"
                priority
              />
            </Link>
            <div />
          </div>
        </header>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
