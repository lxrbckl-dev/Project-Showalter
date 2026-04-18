import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import {
  bookings,
  type BookingRow,
} from '@/db/schema/bookings';
import { services, type ServiceRow } from '@/db/schema/services';

/**
 * Admin read-side queries for the Phase 6 inbox.
 *
 * Three Queue sections per STACK.md § Complete/no-show queue and the ticket:
 *   - Pending                — status='pending',  start_at in the future
 *   - Confirmed upcoming     — status='accepted', start_at in the future
 *   - Needs attention        — status='accepted', start_at in the past
 *
 * History: everything else (terminal rows), paginated desc by start_at.
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface BookingRowWithService extends BookingRow {
  serviceName: string | null;
}

function joinService(db: Db, rows: BookingRow[]): BookingRowWithService[] {
  if (rows.length === 0) return [];
  const svcIds = Array.from(new Set(rows.map((r) => r.serviceId)));
  const svcs = db
    .select({ id: services.id, name: services.name })
    .from(services)
    .where(inArray(services.id, svcIds))
    .all();
  const byId = new Map(svcs.map((s) => [s.id, s.name]));
  return rows.map((r) => ({ ...r, serviceName: byId.get(r.serviceId) ?? null }));
}

export interface InboxQueue {
  pending: BookingRowWithService[];
  confirmedUpcoming: BookingRowWithService[];
  needsAttention: BookingRowWithService[];
}

export function getInboxQueue(db: Db, now: Date = new Date()): InboxQueue {
  const nowIso = now.toISOString();

  const pending = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, 'pending'), gte(bookings.startAt, nowIso)))
    .orderBy(asc(bookings.startAt))
    .all();

  const confirmedUpcoming = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, 'accepted'), gte(bookings.startAt, nowIso)))
    .orderBy(asc(bookings.startAt))
    .all();

  const needsAttention = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, 'accepted'), lt(bookings.startAt, nowIso)))
    .orderBy(asc(bookings.startAt))
    .all();

  return {
    pending: joinService(db, pending),
    confirmedUpcoming: joinService(db, confirmedUpcoming),
    needsAttention: joinService(db, needsAttention),
  };
}

export interface HistoryOptions {
  limit?: number;
  offset?: number;
}

export function getInboxHistory(
  db: Db,
  opts: HistoryOptions = {},
): BookingRowWithService[] {
  const { limit = 50, offset = 0 } = opts;
  const rows = db
    .select()
    .from(bookings)
    .where(
      inArray(bookings.status, [
        'completed',
        'no_show',
        'declined',
        'canceled',
        'expired',
      ]),
    )
    .orderBy(desc(bookings.startAt))
    .limit(limit)
    .offset(offset)
    .all();
  return joinService(db, rows);
}

export function getAdminBookingById(
  db: Db,
  id: number,
): (BookingRowWithService & { service: ServiceRow | null }) | null {
  const row = db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1)
    .all()[0];
  if (!row) return null;
  const svc = db
    .select()
    .from(services)
    .where(eq(services.id, row.serviceId))
    .limit(1)
    .all()[0] ?? null;
  return { ...row, serviceName: svc?.name ?? null, service: svc };
}

/** Stats strip: counts of pending + confirmed-this-week. */
export interface HeaderStats {
  pending: number;
  confirmedThisWeek: number;
}

export function getHeaderStats(db: Db, now: Date = new Date()): HeaderStats {
  const nowIso = now.toISOString();
  const weekOut = new Date(now.getTime() + 7 * 24 * 3_600_000).toISOString();

  const pendingRow = db
    .select({ c: sql<number>`count(*)` })
    .from(bookings)
    .where(eq(bookings.status, 'pending'))
    .all()[0];
  const confirmedRow = db
    .select({ c: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'accepted'),
        gte(bookings.startAt, nowIso),
        lt(bookings.startAt, weekOut),
      ),
    )
    .all()[0];
  return {
    pending: Number(pendingRow?.c ?? 0),
    confirmedThisWeek: Number(confirmedRow?.c ?? 0),
  };
}
