import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { auth } from '@/features/auth/auth';
import { getDb } from '@/db';
import { admins as adminsTable } from '@/db/schema/admins';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import {
  getHeaderStats,
  getInboxQueue,
} from '@/features/bookings/admin-queries';
import { formatUSPhone } from '@/lib/formatters/phone';
import { PushSubscribeButton } from '@/components/admin/PushSubscribeButton';

/**
 * Admin dashboard — Phase 6.
 *
 * Now that the Phase 6 surface is live, the dashboard shows the two "needs
 * eyes now" queues directly:
 *   - Pending count + list header link
 *   - Needs-attention list (confirmed-in-the-past) with inline action links
 *
 * Header stats (pending + confirmed-this-week) are rendered in the shell
 * layout; we don't duplicate them here.
 */

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await auth();
  const email = session?.user.email ?? '';

  const db = getDb();
  const stats = getHeaderStats(db);
  const queue = getInboxQueue(db);
  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  // Resolve the admin's display name, falling back to email for legacy rows
  // that pre-date the `name` column being added in migration 0021.
  const adminRow = email
    ? db
        .select({ name: adminsTable.name })
        .from(adminsTable)
        .where(eq(adminsTable.email, email))
        .limit(1)
        .all()[0]
    : null;
  const displayName = adminRow?.name?.trim() || email;

  // VAPID public key is passed down to the client subscribe button — it
  // needs it to call pushManager.subscribe(). We keep the var server-only
  // (no NEXT_PUBLIC_) so the private key's sibling never accidentally
  // ships into the client bundle.
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';

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

      <section data-testid="push-subscribe-section">
        <PushSubscribeButton vapidPublicKey={vapidPublicKey} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          Confirmed upcoming ({queue.confirmedUpcoming.length})
        </h2>
        <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
          Accepted bookings on the calendar — your tasking ahead of you.
        </p>
        {queue.confirmedUpcoming.length === 0 ? (
          <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            Nothing on the calendar yet.
          </p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {queue.confirmedUpcoming.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/inbox/${b.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[hsl(var(--accent))]"
                  data-testid={`dashboard-confirmed-upcoming-${b.id}`}
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
