import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import { siteConfig } from '@/db/schema/site-config';
import { buildIcs } from '@/features/calendar/ics';

/**
 * GET /bookings/<token>/ics — Phase 7.
 *
 * Returns a valid `text/calendar` VCALENDAR for the booking addressed by
 * <token>. The token is the only capability the customer has; unknown
 * tokens return 404 with a vague body to avoid enumeration (STACK.md
 * § Security).
 *
 * No auth. The endpoint is baked into the Apple/universal calendar link
 * sent in confirmation emails.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  if (!token) {
    return new Response('Not found', { status: 404 });
  }

  // `?cancel=1` flips the file to METHOD:CANCEL + STATUS:CANCELLED with
  // the same UID so a previously-imported event can be removed from the
  // customer's calendar (best supported on iOS).
  const wantCancel = new URL(request.url).searchParams.get('cancel') === '1';

  const db = getDb();
  const booking = db
    .select()
    .from(bookings)
    .where(eq(bookings.token, token))
    .limit(1)
    .all()[0];
  if (!booking) {
    return new Response('Not found', { status: 404 });
  }

  const svc = db
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, booking.serviceId))
    .limit(1)
    .all()[0];

  const cfg = db
    .select({ timezone: siteConfig.timezone })
    .from(siteConfig)
    .limit(1)
    .all()[0];
  const timezone = cfg?.timezone ?? 'America/Chicago';

  const ics = buildIcs({
    token: booking.token,
    startAtIso: booking.startAt,
    summary: svc?.name ?? 'Appointment',
    location: booking.addressText,
    description: booking.notes ?? undefined,
    timezone,
    method: wantCancel ? 'cancel' : 'publish',
  });

  const filename = wantCancel
    ? `appointment-${booking.token}-cancel.ics`
    : `appointment-${booking.token}.ics`;

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
