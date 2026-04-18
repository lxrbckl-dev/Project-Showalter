/**
 * Admin shell — route-group layout for every `/admin/*` page EXCEPT the
 * login page. The login page lives under `/admin/login/layout.tsx` with a
 * minimal chrome-free layout so the auth gate can't render before the user
 * has authenticated.
 *
 * This layout:
 *   - Calls `auth()` to fetch the current session (redirects to /admin/login
 *     if missing — belt-and-suspenders alongside middleware)
 *   - Renders nav, signed-in email, unread badge placeholder, logout button
 *   - Passes rendered children through to the specific page
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/features/auth/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { logoutAction } from './actions';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/inbox', label: 'Inbox' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/content', label: 'Content' },
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
  // Placeholder — real notifications feed lands in Phase 6.
  const unreadCount = 0;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm font-semibold tracking-tight">
              Showalter Admin
            </Link>
            <Badge variant="secondary" aria-label={`${unreadCount} unread notifications`}>
              {unreadCount}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="signed-in-email">
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

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
