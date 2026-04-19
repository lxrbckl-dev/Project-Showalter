import Link from 'next/link';
import { getDb } from '@/db';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import {
  getInboxHistory,
  getInboxQueue,
  type BookingRowWithService,
} from '@/features/bookings/admin-queries';
import { Badge } from '@/components/ui/badge';
import { formatUSPhone } from '@/lib/formatters/phone';
import { formatStatus } from '@/lib/format-status';
import { StandaloneReviewWidget } from './_components/StandaloneReviewWidget';

/**
 * Admin inbox — Phase 6.
 *
 * Two sub-views rendered as sibling sections (server-rendered, no tabs
 * library dependency). Per STACK.md + the ticket:
 *   - Queue:   Pending, Confirmed upcoming, Needs attention
 *   - History: terminal rows (completed/declined/canceled/no_show/expired),
 *              paginated by ?page=<n>&view=history
 *
 * Clicking a row navigates to the detail page `/admin/inbox/[bookingId]`.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type SearchParams = Promise<{
  view?: string;
  page?: string;
}>;

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const view = sp.view === 'history' ? 'history' : 'queue';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const db = getDb();
  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Triage pending requests, surface confirmed jobs, close out the
            past ones.
          </p>
        </div>
        <nav className="flex gap-2" data-testid="inbox-view-tabs">
          <Link
            href="/admin/inbox"
            data-testid="view-queue"
            data-active={view === 'queue'}
            className={cx(
              'rounded-md px-3 py-1 text-sm',
              view === 'queue'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
            )}
          >
            Queue
          </Link>
          <Link
            href="/admin/inbox?view=history"
            data-testid="view-history"
            data-active={view === 'history'}
            className={cx(
              'rounded-md px-3 py-1 text-sm',
              view === 'history'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
            )}
          >
            History
          </Link>
        </nav>
      </header>

      {view === 'queue' ? (
        <>
          <StandaloneReviewWidget />
          <QueueView tz={tz} />
        </>
      ) : (
        <HistoryView tz={tz} page={page} />
      )}
    </div>
  );
}

function QueueView({ tz }: { tz: string }) {
  const queue = getInboxQueue(getDb());
  return (
    <div className="space-y-8">
      <Section
        id="pending"
        title="Pending"
        subtitle="Waiting for your accept or decline."
        rows={queue.pending}
        tz={tz}
        emptyText="No pending requests. Nice."
      />
      <Section
        id="confirmed-upcoming"
        title="Confirmed upcoming"
        subtitle="On the books, still in the future."
        rows={queue.confirmedUpcoming}
        tz={tz}
        emptyText="Nothing confirmed and upcoming."
      />
      <Section
        id="needs-attention"
        title="Needs attention"
        subtitle="Confirmed, but the start time has passed. Mark complete or no-show."
        rows={queue.needsAttention}
        tz={tz}
        emptyText="Nothing waiting to be closed out."
      />
    </div>
  );
}

function HistoryView({ tz, page }: { tz: string; page: number }) {
  const offset = (page - 1) * PAGE_SIZE;
  const rows = getInboxHistory(getDb(), { limit: PAGE_SIZE + 1, offset });
  const hasNext = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);
  return (
    <div className="space-y-4" data-testid="history-view">
      <Section
        id="history"
        title="History"
        subtitle="Closed-out bookings — completed, no-show, declined, canceled, expired."
        rows={visible}
        tz={tz}
        emptyText="No history yet."
      />
      <div className="flex items-center justify-between text-sm">
        <span className="text-[hsl(var(--muted-foreground))]">Page {page}</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/inbox?view=history&page=${page - 1}`}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1"
              data-testid="history-prev"
            >
              Newer
            </Link>
          )}
          {hasNext && (
            <Link
              href={`/admin/inbox?view=history&page=${page + 1}`}
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1"
              data-testid="history-next"
            >
              Older
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  rows,
  tz,
  emptyText,
}: {
  id: string;
  title: string;
  subtitle: string;
  rows: BookingRowWithService[];
  tz: string;
  emptyText: string;
}) {
  return (
    <section data-testid={`inbox-section-${id}`} data-count={rows.length}>
      <header className="mb-2 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {title}{' '}
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              ({rows.length})
            </span>
          </h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {subtitle}
          </p>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/inbox/${b.id}`}
                data-testid={`inbox-row-${b.id}`}
                data-status={b.status}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[hsl(var(--accent))]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{b.customerName}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    {formatUSPhone(b.customerPhone)}
                    {' · '}
                    {b.serviceName ?? 'Service'}
                    {' · '}
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
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'pending'
      ? 'secondary'
      : status === 'accepted'
        ? 'default'
        : status === 'completed'
          ? 'default'
          : 'secondary';
  return (
    <Badge variant={variant} data-testid={`row-status-${status}`}>
      {formatStatus(status)}
    </Badge>
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

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
