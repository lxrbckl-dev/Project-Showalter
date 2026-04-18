import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { getBookingByToken } from '@/features/bookings/queries';
import { formatUSPhone } from '@/lib/formatters/phone';
import type { BookingStatus } from '@/db/schema/bookings';
import { CancelButton } from '@/components/public/booking/CancelButton';

/**
 * Customer-facing booking page — Phase 5.
 *
 * Public, tokenized (no login). Renders differently per status (see table
 * in STACK.md § Customer booking page). The `cancel` button is a client
 * component that calls the cancel-by-customer server action.
 *
 * Unknown token → 404 (same body as any other not-found, per STACK.md:
 * "no distinction that would enable enumeration").
 */

export const dynamic = 'force-dynamic';

// Status → copy for the top banner.
// The `completed` body interpolates the admin-configurable site title so a
// future rebrand flows through without a code change.
function buildStatusCopy(
  siteTitle: string,
): Record<BookingStatus, { heading: string; body: string; canCancel: boolean }> {
  return {
    pending: {
      heading: 'Request received',
      body: 'Waiting for Sawyer to confirm. You can cancel below anytime before he responds.',
      canCancel: true,
    },
    accepted: {
      heading: 'Appointment confirmed',
      body: 'Sawyer confirmed your appointment. See you then!',
      canCancel: true,
    },
    declined: {
      heading: "Sawyer couldn't take this one",
      body: 'Feel free to submit another request with a different day or service.',
      canCancel: false,
    },
    canceled: {
      heading: 'Appointment canceled',
      body: 'This appointment was canceled. No further action needed.',
      canCancel: false,
    },
    expired: {
      heading: 'Request expired',
      body: 'This request sat pending for too long — feel free to submit a new one.',
      canCancel: false,
    },
    completed: {
      heading: 'Job completed',
      body: `Thanks for choosing ${siteTitle} — see you next time!`,
      canCancel: false,
    },
    no_show: {
      heading: 'Marked no-show',
      body: 'This appointment is closed out.',
      canCancel: false,
    },
  };
}

function formatStartAt(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const result = getBookingByToken(token);
  if (!result) {
    notFound();
  }

  const { booking, service, attachments } = result;

  const db = getDb();
  const cfg = db
    .select({
      timezone: siteConfigTable.timezone,
      siteTitle: siteConfigTable.siteTitle,
    })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';
  const siteTitle = cfg?.siteTitle ?? 'Sawyer Showalter Service';

  const copy = buildStatusCopy(siteTitle)[booking.status];

  // Reschedule forward pointer — Phase 6.
  // If this booking was canceled via the reschedule flow, show a banner linking
  // to the replacement `/bookings/<new-token>`. Populated by the admin
  // reschedule server action; stays NULL for plain cancellations.
  let rescheduledTo:
    | { token: string; startAt: string }
    | null = null;
  if (booking.rescheduledToId) {
    const next = db
      .select({ token: bookings.token, startAt: bookings.startAt })
      .from(bookings)
      .where(eq(bookings.id, booking.rescheduledToId))
      .limit(1)
      .all()[0];
    if (next) rescheduledTo = next;
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-sm text-green-300 hover:text-green-100">
            &larr; {siteTitle}
          </Link>
        </div>

        {rescheduledTo && (
          <div
            data-testid="rescheduled-to"
            className="mb-6 rounded-lg border border-yellow-700 bg-yellow-950/40 p-6"
          >
            <h2 className="mb-2 text-lg font-semibold text-yellow-100">
              This appointment was rescheduled
            </h2>
            <p className="text-yellow-200">
              Your updated confirmation is at{' '}
              <Link
                href={`/bookings/${rescheduledTo.token}`}
                className="underline"
                data-testid="rescheduled-to-link"
              >
                {formatStartAt(rescheduledTo.startAt, tz)}
              </Link>
              . See your updated confirmation.
            </p>
          </div>
        )}

        <div
          data-testid="booking-status"
          data-status={booking.status}
          className="mb-6 rounded-lg border border-green-800 bg-green-950/40 p-6"
        >
          <h1 className="mb-2 text-2xl font-bold">{copy.heading}</h1>
          <p className="text-green-200">{copy.body}</p>
        </div>

        <dl className="mb-6 space-y-3 rounded-lg border border-gray-800 bg-gray-950 p-6 text-sm">
          <DetailRow label="Service" value={service?.name ?? '—'} />
          <DetailRow label="When" value={formatStartAt(booking.startAt, tz)} />
          <DetailRow label="Name" value={booking.customerName} />
          <DetailRow label="Phone" value={formatUSPhone(booking.customerPhone)} />
          {booking.customerEmail && (
            <DetailRow label="Email" value={booking.customerEmail} />
          )}
          <DetailRow label="Address" value={booking.addressText} />
          {booking.notes && <DetailRow label="Notes" value={booking.notes} />}
        </dl>

        {attachments.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">Photos you sent</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/uploads/${a.filePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-md border border-gray-800"
                >
                  {/* Plain <img>: Next.js Image needs static width/height for
                      remote paths served from /uploads. Customer-submitted
                      photos don't need the Image pipeline — lightweight is
                      fine for this read-only view. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/uploads/${a.filePath}`}
                    alt={a.originalFilename}
                    className="h-32 w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {copy.canCancel && <CancelButton token={booking.token} />}
      </div>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-24 flex-shrink-0 text-gray-400">{label}</dt>
      <dd className="flex-1 text-white">{value}</dd>
    </div>
  );
}
