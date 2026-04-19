import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { listNotifications } from '@/features/notifications/queries';
import { NotificationRowControls } from './_components/NotificationRowControls';

/**
 * Admin notifications page — Phase 6.
 *
 * Paginated desc-by-created. Each row exposes a mark-as-read action; if the
 * notification is scoped to a booking (kind='booking_canceled_by_customer'
 * or future booking-scoped kinds), the row also links to the booking's
 * detail page.
 *
 * The admin-shell header badge reads `unreadCount()` every request — marking
 * a notification read here forces a revalidation of /admin paths so the
 * badge refreshes when the user navigates back.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  page?: string;
}>;

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();
  const rows = listNotifications(db, { limit: PAGE_SIZE + 1, offset });
  const hasNext = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);

  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  // Preload the set of referenced bookings so each row can render a link
  // target in one pass rather than one query per row.
  const bookingIds = Array.from(
    new Set(
      visible
        .map((n) => n.bookingId ?? parseBookingIdFromPayload(n.payloadJson))
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  const bookingMap = new Map<number, { id: number; token: string }>();
  if (bookingIds.length > 0) {
    const found = db
      .select({ id: bookings.id, token: bookings.token })
      .from(bookings)
      .where(inArray(bookings.id, bookingIds))
      .all();
    for (const b of found) bookingMap.set(b.id, b);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Everything that&apos;s landed in your in-app inbox.
          </p>
        </div>
        <NotificationRowControls kind="mark-all" ids={[]} />
      </header>

      {visible.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]"
          data-testid="notifications-empty"
        >
          Nothing here yet.
        </p>
      ) : (
        <ul
          className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]"
          data-testid="notifications-list"
        >
          {visible.map((n) => {
            const bookingId =
              n.bookingId ?? parseBookingIdFromPayload(n.payloadJson);
            const booking =
              bookingId !== null ? (bookingMap.get(bookingId) ?? null) : null;
            return (
              <li
                key={n.id}
                data-testid={`notification-row-${n.id}`}
                data-read={n.read ? '1' : '0'}
                className={
                  n.read
                    ? 'flex items-center justify-between gap-3 px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]'
                    : 'flex items-center justify-between gap-3 bg-[hsl(var(--accent))] px-4 py-3 text-sm'
                }
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {renderSubject(n.kind, n.payloadJson)}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {formatCreatedAt(n.createdAt, tz)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {booking && (
                    <Link
                      href={`/admin/inbox/${booking.id}`}
                      data-testid={`notification-link-${n.id}`}
                      className="rounded-md border border-[hsl(var(--border))] px-3 py-1 text-xs"
                    >
                      Open booking
                    </Link>
                  )}
                  {!n.read && (
                    <NotificationRowControls kind="mark-one" ids={[n.id]} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-[hsl(var(--muted-foreground))]">Page {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/notifications?page=${page - 1}`}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1"
              data-testid="notifications-prev"
            >
              Newer
            </Link>
          )}
          {hasNext && (
            <Link
              href={`/admin/notifications?page=${page + 1}`}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1"
              data-testid="notifications-next"
            >
              Older
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Parse a `booking_id` out of the payload JSON. Phase 5 rows predate the
 * `notifications.booking_id` column; the column is NULL on those rows but
 * the payload carries the id we need.
 */
function parseBookingIdFromPayload(payloadJson: string): number | null {
  try {
    const p = JSON.parse(payloadJson);
    if (p && typeof p.bookingId === 'number') return p.bookingId;
  } catch {
    // ignore
  }
  return null;
}

function renderSubject(kind: string, payloadJson: string): string {
  try {
    const p = JSON.parse(payloadJson) as Record<string, unknown>;
    const name = typeof p.customerName === 'string' ? p.customerName : 'Customer';
    const service =
      typeof p.serviceName === 'string' ? p.serviceName : 'a booking';
    const when = typeof p.startAt === 'string' ? formatISOShort(p.startAt) : '';
    if (kind === 'booking_submitted') {
      return `New booking request: ${service} on ${when} — ${name}`;
    }
    if (kind === 'booking_canceled_by_customer') {
      return `Customer canceled: ${service} on ${when} — ${name}`;
    }
  } catch {
    // fall through
  }
  return kind.replace(/_/g, ' ');
}

function formatISOShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatCreatedAt(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

