import Link from 'next/link';
import { auth } from '@/features/auth/auth';
import { getDb } from '@/db';
import { admins as adminsTable } from '@/db/schema/admins';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import {
  getHeaderStats,
  getInboxQueue,
} from '@/features/bookings/admin-queries';
import { formatUSPhone } from '@/lib/formatters/phone';

/**
 * Admin dashboard.
 *
 * Surfaces the operational present:
 *   - Stats badges (pending count, confirmed this week)
 *   - Push subscribe affordance
 *   - Decide soon — pending bookings within 12h of the 72h auto-expire
 *     cutoff, so Sawyer can act before silent expiry
 *   - Today / Tomorrow — confirmed upcoming bookings bucketed by date in
 *     the site timezone
 *   - Needs attention — confirmed bookings whose start time has passed
 *
 * Anything beyond tomorrow is summarized as a count with a link into the
 * full inbox so the dashboard stays scannable.
 */

const HOURS_60_MS = 60 * 60 * 60 * 1000;
const HOURS_72_MS = 72 * 60 * 60 * 1000;

/** "YYYY-MM-DD" in the given IANA tz — used to bucket bookings by calendar day. */
function dateInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await auth();

  const db = getDb();
  const stats = getHeaderStats(db);
  const queue = getInboxQueue(db);
  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  // Expiring soon — pending bookings whose 72h auto-expire fires within 12h.
  // The cron silently flips the row to `expired`, so the dashboard is the
  // last chance for Sawyer to decide. Sorted by closest-to-cutoff first.
  const now = new Date();
  const expiringSoon = queue.pending
    .map((b) => {
      const ageMs = now.getTime() - new Date(b.createdAt).getTime();
      return { booking: b, hoursLeft: Math.max(0, (HOURS_72_MS - ageMs) / 3_600_000) };
    })
    .filter((x) => {
      const ageMs = now.getTime() - new Date(x.booking.createdAt).getTime();
      return ageMs >= HOURS_60_MS && ageMs < HOURS_72_MS;
    })
    .sort((a, b) => a.hoursLeft - b.hoursLeft);

  // Bucket confirmed upcoming by today / tomorrow / later in the site tz.
  const todayDate = dateInTz(now.toISOString(), tz);
  const tomorrowDate = dateInTz(
    new Date(now.getTime() + 24 * 3_600_000).toISOString(),
    tz,
  );
  const today: typeof queue.confirmedUpcoming = [];
  const tomorrow: typeof queue.confirmedUpcoming = [];
  let laterCount = 0;
  for (const b of queue.confirmedUpcoming) {
    const d = dateInTz(b.startAt, tz);
    if (d === todayDate) today.push(b);
    else if (d === tomorrowDate) tomorrow.push(b);
    else laterCount += 1;
  }

  // Single-admin install: pull the lone admin's display name. Falls back
  // to "Admin" if the name column is unset.
  const adminRow = db
    .select({ name: adminsTable.name })
    .from(adminsTable)
    .limit(1)
    .all()[0];
  const displayName = adminRow?.name?.trim() || 'Admin';

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {displayName}.
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Quick look at what needs your attention. Full inbox is under{' '}
          <Link href="/admin/inbox" className="underline">
            Inbox
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="header-stats">
          <Link
            href="/admin/inbox"
            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            data-testid="stats-pending"
          >
            Pending
            <span
              className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-bold text-[hsl(var(--foreground))]"
              data-testid="stats-pending-count"
            >
              {stats.pending}
            </span>
          </Link>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]"
            data-testid="stats-confirmed-week"
          >
            Confirmed this week
            <span
              className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-bold text-[hsl(var(--foreground))]"
              data-testid="stats-confirmed-count"
            >
              {stats.confirmedThisWeek}
            </span>
          </span>
        </div>
      </section>

      {expiringSoon.length > 0 && (
        <section data-testid="dashboard-expiring-soon">
          <h2 className="mb-2 text-lg font-semibold text-amber-700">
            Decide soon ({expiringSoon.length})
          </h2>
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Pending requests that will auto-expire within the next 12 hours
            unless you accept or decline them.
          </p>
          <ul className="divide-y divide-amber-200 rounded-md border border-amber-300 bg-amber-50/60">
            {expiringSoon.map(({ booking: b, hoursLeft }) => (
              <li key={b.id}>
                <Link
                  href={`/admin/inbox/${b.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-amber-100/70"
                  data-testid={`dashboard-expiring-${b.id}`}
                >
                  <div>
                    <div className="font-medium">{b.customerName}</div>
                    <div className="text-xs text-amber-900/70">
                      {formatUSPhone(b.customerPhone)} ·{' '}
                      {b.serviceName ?? 'Service'} ·{' '}
                      {formatStartAt(b.startAt, tz)}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-700">
                    Expires in ~{Math.round(hoursLeft)}h →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-testid="dashboard-today">
        <h2 className="mb-2 text-lg font-semibold">Today ({today.length})</h2>
        {today.length === 0 ? (
          <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            Nothing on the schedule today.
          </p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {today.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/inbox/${b.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[hsl(var(--accent))]"
                  data-testid={`dashboard-today-${b.id}`}
                >
                  <div>
                    <div className="font-medium">{b.customerName}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {formatUSPhone(b.customerPhone)} ·{' '}
                      {b.serviceName ?? 'Service'} ·{' '}
                      {formatStartAt(b.startAt, tz)}
                    </div>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    View →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="dashboard-tomorrow">
        <h2 className="mb-2 text-lg font-semibold">
          Tomorrow ({tomorrow.length})
        </h2>
        {tomorrow.length === 0 ? (
          <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            Nothing on the schedule for tomorrow.
          </p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {tomorrow.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/inbox/${b.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[hsl(var(--accent))]"
                  data-testid={`dashboard-tomorrow-${b.id}`}
                >
                  <div>
                    <div className="font-medium">{b.customerName}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {formatUSPhone(b.customerPhone)} ·{' '}
                      {b.serviceName ?? 'Service'} ·{' '}
                      {formatStartAt(b.startAt, tz)}
                    </div>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    View →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {laterCount > 0 && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {laterCount} more confirmed booking{laterCount === 1 ? '' : 's'}{' '}
          beyond tomorrow —{' '}
          <Link href="/admin/inbox" className="underline" data-testid="dashboard-later-link">
            see full inbox
          </Link>
          .
        </p>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          Needs attention ({queue.needsAttention.length})
        </h2>
        <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
          Confirmed bookings whose start time has passed — close them out.
        </p>
        {queue.needsAttention.length === 0 ? (
          <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            Nothing waiting to be closed out.
          </p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {queue.needsAttention.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/inbox/${b.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[hsl(var(--accent))]"
                  data-testid={`dashboard-needs-attention-${b.id}`}
                >
                  <div>
                    <div className="font-medium">{b.customerName}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {formatUSPhone(b.customerPhone)} ·{' '}
                      {b.serviceName ?? 'Service'} ·{' '}
                      {formatStartAt(b.startAt, tz)}
                    </div>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    Close out →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatStartAt(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}
