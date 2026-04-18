import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings, type BookingRow } from '@/db/schema/bookings';
import {
  bookingAttachments,
  type BookingAttachmentRow,
} from '@/db/schema/booking-attachments';
import { services, type ServiceRow } from '@/db/schema/services';

/**
 * Read-side queries for the booking flow. All writes go through the action
 * modules (`submit.ts`, `cancel-by-customer.ts`). Queries here are
 * synchronous because better-sqlite3 is blocking — safe to call from server
 * components without awaiting.
 */

export interface BookingByTokenResult {
  booking: BookingRow;
  service: ServiceRow | null;
  attachments: BookingAttachmentRow[];
}

/**
 * Fetch a booking by its unguessable token, plus its service row and any
 * attached photos. Returns null when the token does not exist — callers
 * render the same 404 body as any other unknown path (no enumeration).
 */
export function getBookingByToken(token: string): BookingByTokenResult | null {
  const db = getDb();
  const row = db
    .select()
    .from(bookings)
    .where(eq(bookings.token, token))
    .limit(1)
    .all()[0];
  if (!row) return null;

  const svc = db
    .select()
    .from(services)
    .where(eq(services.id, row.serviceId))
    .limit(1)
    .all()[0] ?? null;

  const attachments = db
    .select()
    .from(bookingAttachments)
    .where(eq(bookingAttachments.bookingId, row.id))
    .orderBy(asc(bookingAttachments.id))
    .all();

  return { booking: row, service: svc, attachments };
}

/**
 * Return all active services for the public picker. Mirrors the landing-page
 * services list (active = 1, sorted by sort_order). Kept here to avoid
 * pulling in the admin queries module from public components.
 */
export function getActiveServices(): ServiceRow[] {
  const db = getDb();
  return db
    .select()
    .from(services)
    .where(eq(services.active, 1))
    .orderBy(asc(services.sortOrder))
    .all();
}

/**
 * Internal helper used by the admin inbox (Phase 6). Exposed here so admin
 * queries can import from a stable location. Returns bookings in a given
 * status, ordered by start time.
 */
export function getBookingsByStatus(status: BookingRow['status']): BookingRow[] {
  const db = getDb();
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, status)))
    .orderBy(asc(bookings.startAt))
    .all();
}
