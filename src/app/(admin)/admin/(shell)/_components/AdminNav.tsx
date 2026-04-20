'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  CalendarPlus,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Star,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { logoutAction } from '../actions';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/inbox', label: 'Inbox', icon: Inbox },
  { href: '/admin/bookings/new', label: 'Booking', icon: CalendarPlus },
  { href: '/admin/schedule', label: 'Schedule', icon: Calendar },
  { href: '/admin/services', label: 'Services', icon: ClipboardList },
  { href: '/admin/content', label: 'Content', icon: FileText },
  { href: '/admin/gallery', label: 'Gallery', icon: ImageIcon },
  { href: '/admin/index-book', label: 'Rolodex', icon: Users },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/wiki', label: 'Wiki', icon: BookOpen },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

/**
 * `isActive` — true when the current pathname matches or is nested under `href`.
 *
 * Special-cased: `/admin` (Dashboard) uses exact match only, because every
 * other admin route starts with `/admin/` and would otherwise always highlight
 * the Dashboard tab.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

interface AdminNavProps {
  /** Unread notification count — rendered as an inline badge on the Inbox row. */
  unread: number;
}

/**
 * Admin navigation — hamburger button + slide-out drawer. Replaces the
 * earlier flat tab strip; works identically on desktop and mobile and keeps
 * all 11 destinations one tap away without competing for header real estate.
 *
 * Drawer dismissal: Escape, backdrop click, route change, or the Close (X)
 * button. Body scroll is locked while open so background content doesn't
 * shift under the customer.
 */
export function AdminNav({ unread }: AdminNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on navigation — clicking a link changes pathname; we react to that
  // so the drawer dismisses without each Link needing its own onClick.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        data-testid="admin-menu-button"
        className="inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Overlay is always rendered so the slide animation has both
        directions (in AND out) to transition over. When closed,
        `pointer-events-none` keeps the invisible layer from intercepting
        clicks; the backdrop fades and the panel slides off-screen. */}
      <div
        className={
          open
            ? 'fixed inset-0 z-50 pointer-events-auto'
            : 'fixed inset-0 z-50 pointer-events-none'
        }
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        aria-hidden={!open}
      >
        {/* Backdrop fades in/out. */}
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={
            open
              ? 'absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out opacity-100'
              : 'absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out opacity-0'
          }
        />
        {/* Drawer panel slides in from the left. `-translate-x-full` parks
          it off-screen when closed; `translate-x-0` brings it back. */}
        <div
          data-testid="admin-menu-drawer"
          className={
            open
              ? 'absolute left-0 top-0 grid h-dvh w-72 max-w-[85vw] grid-rows-[auto_1fr_auto] border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl transition-transform duration-200 ease-out translate-x-0'
              : 'absolute left-0 top-0 grid h-dvh w-72 max-w-[85vw] grid-rows-[auto_1fr_auto] border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl transition-transform duration-200 ease-out -translate-x-full'
          }
        >
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
            <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              Menu
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              tabIndex={open ? 0 : -1}
              data-testid="admin-menu-close"
              className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <ul className="overflow-y-auto py-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              const isInbox = item.href === '/admin/inbox';
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    tabIndex={open ? 0 : -1}
                    data-testid={`nav-${item.href}`}
                    className={
                      active
                        ? 'flex items-center gap-3 border-l-4 border-[#6C9630] bg-[hsl(var(--accent))] py-3 pl-3 pr-4 text-sm font-semibold text-[#6C9630]'
                        : 'flex items-center gap-3 border-l-4 border-transparent py-3 pl-3 pr-4 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {isInbox && unread > 0 && (
                      <span
                        aria-label={`${unread} unread`}
                        className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white"
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Logout — separated by a divider, anchored at the bottom of the
            drawer. `mt-auto` and `shrink-0` together pin it to the bottom
            and prevent it from being squeezed off-screen if the nav list
            grows. Posts to the existing server action; on success the
            redirect to /admin/login resets the drawer state implicitly. */}
          <form
            action={logoutAction}
            className="border-t border-[hsl(var(--border))]"
          >
            <button
              type="submit"
              tabIndex={open ? 0 : -1}
              data-testid="admin-menu-logout"
              className="flex w-full items-center gap-3 border-l-4 border-transparent py-3 pl-3 pr-4 text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
            >
              <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-left">Logout</span>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
