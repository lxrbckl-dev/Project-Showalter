'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/inbox', label: 'Inbox' },
  { href: '/admin/bookings/new', label: 'Booking' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/index-book', label: 'Rolodex' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/wiki', label: 'Wiki' },
  { href: '/admin/settings', label: 'Settings' },
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
  /** Unread notification count — rendered as an overlay badge on the Inbox tab when > 0. */
  unread: number;
}

export function AdminNav({ unread }: AdminNavProps) {
  const pathname = usePathname();

  return (
    // `flex-1` on each <li> divides the available row evenly so every tab
    // is the same width regardless of label length. The active green
    // underline therefore spans the whole tab slot, not just the text.
    <ul className="mx-auto flex max-w-6xl px-6 py-2">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const isInbox = item.href === '/admin/inbox';

        return (
          <li key={item.href} className="relative min-w-0 flex-1">
            <Link
              href={item.href}
              className={[
                'block w-full whitespace-nowrap px-2 py-1 text-center text-sm transition-colors',
                active
                  ? 'font-semibold text-[#6C9630] border-b-2 border-[#6C9630]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>

            {/* Overlay badge — only on Inbox, only when count > 0 */}
            {isInbox && unread > 0 && (
              <span
                aria-label={`${unread} unread`}
                className="pointer-events-none absolute right-1 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-[3px] text-[10px] font-bold leading-none text-white"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
