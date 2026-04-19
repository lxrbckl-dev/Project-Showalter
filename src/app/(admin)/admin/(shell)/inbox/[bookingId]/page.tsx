import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookingAttachments } from '@/db/schema/booking-attachments';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { getAdminBookingById } from '@/features/bookings/admin-queries';
import { availableAdminActions } from '@/features/bookings/state';
import {
  composeConfirmationForBooking,
  type ConfirmationTemplateKind,
} from '@/features/confirmations/compose';
import { formatUSPhone } from '@/lib/formatters/phone';
import { formatStatus } from '@/lib/format-status';
import { Badge } from '@/components/ui/badge';
import { BookingDecideControls } from './_components/BookingDecideControls';
import {
  ConfirmationButtons,
  type ConfirmationHref,
} from './_components/ConfirmationButtons';
import { RescheduleControls } from './_components/RescheduleControls';
import { ReviewRequestControls } from './_components/ReviewRequestControls';
import { bookings } from '@/db/schema/bookings';
import {
  findPendingReviewForBooking,
  findSubmittedReviewForBooking,
} from '@/features/reviews/queries';
import { composeReviewRequest } from '@/features/reviews/compose';

/**
 * Admin booking detail page — Phase 6.
 *
 * Renders the full booking row + customer snapshot + attachments + the set
 * of action buttons allowed by the state machine at this moment. Each action
 * posts through a server action that re-reads the `expectedUpdatedAt` so the
 * optimistic-lock check can reject stale mutations.
 */

export const dynamic = 'force-dynamic';

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId: raw } = await params;
  const bookingId = Number.parseInt(raw, 10);
  if (!Number.isFinite(bookingId)) notFound();

  const db = getDb();
  const row = getAdminBookingById(db, bookingId);
  if (!row) notFound();

  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  const attachments = db
    .select()
    .from(bookingAttachments)
    .where(eq(bookingAttachments.bookingId, row.id))
    .orderBy(asc(bookingAttachments.id))
    .all();

  // If this booking was superseded via reschedule, surface the forward pointer.
  let rescheduledTo: { id: number; token: string; startAt: string } | null = null;
  if (row.rescheduledToId) {
    const next = db
      .select({
        id: bookings.id,
        token: bookings.token,
        startAt: bookings.startAt,
      })
      .from(bookings)
      .where(eq(bookings.id, row.rescheduledToId))
      .limit(1)
      .all()[0];
    if (next) rescheduledTo = next;
  }

  // And if this booking REPLACED an earlier one, link back.
  const predecessors = db
    .select({
      id: bookings.id,
      token: bookings.token,
      startAt: bookings.startAt,
    })
    .from(bookings)
    .where(and(eq(bookings.rescheduledToId, row.id)))
    .all();

  const actions = availableAdminActions(row.status, row.startAt);

  // Phase 9: for completed bookings, surface the "Request review" flow. If a
  // pending review already exists we render direct mailto/sms buttons (built
  // from the shared template helper); otherwise the control below generates
  // a new review row on click and then the page re-renders into the
  // mailto/sms branch on next pass.
  let pendingReviewId: number | null = null;
  let pendingReviewToken: string | null = null;
  let submittedReviewId: number | null = null;
  const reviewHrefs: ConfirmationHref[] = [];
  if (row.status === 'completed') {
    const submitted = findSubmittedReviewForBooking(db, row.id);
    if (submitted) submittedReviewId = submitted.id;
    const existing = !submitted ? findPendingReviewForBooking(db, row.id) : null;
    if (existing) {
      pendingReviewId = existing.id;
      pendingReviewToken = existing.token;

      const emailCompose = composeReviewRequest(existing.id, 'review_request_email');
      if (emailCompose.ok && emailCompose.email) {
        reviewHrefs.push({
          label: 'Send email review request',
          href: emailCompose.email.href,
          kind: 'email',
          testid: 'send-review-email',
        });
      } else if (!emailCompose.ok && emailCompose.reason === 'missing_email') {
        reviewHrefs.push({
          label: 'Send email review request',
          href: '#',
          kind: 'email',
          testid: 'send-review-email',
          disabled: true,
          disabledReason: 'No email on file for this customer',
        });
      }

      const smsCompose = composeReviewRequest(existing.id, 'review_request_sms');
      if (smsCompose.ok && smsCompose.sms) {
        reviewHrefs.push({
          label: 'Send text review request',
          href: smsCompose.sms.href,
          kind: 'sms',
          testid: 'send-review-sms',
        });
      }
    }
  }

  // Phase 7: mailto/sms confirmation buttons. Only shown when the booking is
  // accepted or declined — these are the two states where Sawyer has a
  // pre-canned message to send the customer.
  const confirmationHrefs: ConfirmationHref[] = [];
  let confirmationSection: 'accepted' | 'declined' | null = null;
  if (row.status === 'accepted') confirmationSection = 'accepted';
  else if (row.status === 'declined') confirmationSection = 'declined';

  if (confirmationSection) {
    const kinds: Array<{
      kind: ConfirmationTemplateKind;
      label: string;
      channel: 'email' | 'sms';
      testid: string;
    }> =
      confirmationSection === 'accepted'
        ? [
            {
              kind: 'confirmation_email',
              label: 'Send email confirmation',
              channel: 'email',
              testid: 'send-confirmation-email',
            },
            {
              kind: 'confirmation_sms',
              label: 'Send text confirmation',
              channel: 'sms',
              testid: 'send-confirmation-sms',
            },
          ]
        : [
            {
              kind: 'decline_email',
              label: 'Send email decline',
              channel: 'email',
              testid: 'send-decline-email',
            },
            {
              kind: 'decline_sms',
              label: 'Send text decline',
              channel: 'sms',
              testid: 'send-decline-sms',
            },
          ];

    for (const entry of kinds) {
      const result = composeConfirmationForBooking(row.id, entry.kind);
      if (result.ok) {
        const href =
          entry.channel === 'email' ? result.email?.href : result.sms?.href;
        if (href) {
          confirmationHrefs.push({
            label: entry.label,
            href,
            kind: entry.channel,
            testid: entry.testid,
          });
        }
      } else if (
        entry.channel === 'email' &&
        result.reason === 'missing_email'
      ) {
        confirmationHrefs.push({
          label: entry.label,
          href: '#',
          kind: 'email',
          testid: entry.testid,
          disabled: true,
          disabledReason: 'No email on file for this customer',
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/admin/inbox"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          &larr; Inbox
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {row.customerName}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {row.serviceName ?? 'Service'} · {formatStartAt(row.startAt, tz)}
          </p>
        </div>
        <Badge data-testid="detail-status" data-status={row.status}>
          {formatStatus(row.status)}
        </Badge>
      </header>

      {rescheduledTo && (
        <div
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm"
          data-testid="detail-rescheduled-to"
        >
          Rescheduled to{' '}
          <strong>{formatStartAt(rescheduledTo.startAt, tz)}</strong> —{' '}
          <Link
            href={`/admin/inbox/${rescheduledTo.id}`}
            className="underline"
          >
            open the new booking
          </Link>
          .
        </div>
      )}

      {predecessors.length > 0 && (
        <div
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm"
          data-testid="detail-replaces"
        >
          This booking replaces{' '}
          {predecessors.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link href={`/admin/inbox/${p.id}`} className="underline">
                {formatStartAt(p.startAt, tz)}
              </Link>
            </span>
          ))}
          .
        </div>
      )}

      <section className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-4 text-lg font-semibold">Details</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <DetailRow label="Service" value={row.serviceName ?? '—'} />
          <DetailRow label="When" value={formatStartAt(row.startAt, tz)} />
          <DetailRow label="Phone" value={formatUSPhone(row.customerPhone)} />
          {row.customerEmail && (
            <DetailRow label="Email" value={row.customerEmail} />
          )}
          <DetailRow label="Address" value={row.addressText} />
          {row.notes && <DetailRow label="Notes" value={row.notes} />}
          <DetailRow label="Status" value={formatStatus(row.status)} />
          <DetailRow
            label="Created"
            value={formatStartAt(row.createdAt, tz)}
          />
          {row.decidedAt && (
            <DetailRow
              label="Decided"
              value={formatStartAt(row.decidedAt, tz)}
            />
          )}
          <DetailRow
            label="Customer token URL"
            value={`/bookings/${row.token}`}
          />
        </dl>
      </section>

      {attachments.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Customer photos</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={`/uploads/${a.filePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border border-[hsl(var(--border))]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/uploads/${a.filePath}`}
                  alt={a.originalFilename}
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {confirmationSection && confirmationHrefs.length > 0 && (
        <section
          className="space-y-3"
          data-testid="detail-confirmations"
          data-confirmation-kind={confirmationSection}
        >
          <h2 className="text-lg font-semibold">
            {confirmationSection === 'accepted'
              ? 'Send confirmation'
              : 'Send decline'}
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Opens your native mail/messages app with the body pre-filled.
            Tap send.
          </p>
          <ConfirmationButtons hrefs={confirmationHrefs} />
        </section>
      )}

      {row.status === 'completed' && (
        <section
          className="space-y-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
          data-testid="detail-review-request"
          data-has-pending={pendingReviewId !== null}
          data-has-submitted={submittedReviewId !== null}
        >
          <h2 className="text-lg font-semibold">Request review</h2>
          {submittedReviewId ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              The customer has already left a review for this booking.{' '}
              <Link
                href={`/admin/reviews/${submittedReviewId}`}
                className="underline"
                data-testid="submitted-review-link"
              >
                View review
              </Link>
              .
            </p>
          ) : pendingReviewId && pendingReviewToken ? (
            <>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                A review request was generated. Tap below to open your mail
                or messages app with the body prefilled, then tap send.
              </p>
              {reviewHrefs.length > 0 ? (
                <ConfirmationButtons hrefs={reviewHrefs} />
              ) : (
                <p className="text-sm text-red-300">
                  No email or phone on file for this customer — share the
                  link manually:{' '}
                  <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5">
                    /review/{pendingReviewToken}
                  </code>
                </p>
              )}
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Link:{' '}
                <Link
                  href={`/review/${pendingReviewToken}`}
                  className="underline"
                  data-testid="review-link"
                >
                  /review/{pendingReviewToken}
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Generate a tokenized review link for this completed booking.
              </p>
              <ReviewRequestControls bookingId={row.id} />
            </>
          )}
        </section>
      )}

      {actions.length > 0 && (
        <section
          className="space-y-3"
          data-testid="detail-actions"
        >
          <h2 className="text-lg font-semibold">Actions</h2>
          <div className="flex flex-wrap items-start gap-2">
            <BookingDecideControls
              bookingId={row.id}
              expectedUpdatedAt={row.updatedAt}
              actions={actions}
            />
            {actions.includes('reschedule') && (
              <RescheduleControls
                bookingId={row.id}
                expectedUpdatedAt={row.updatedAt}
                timezone={tz}
              />
            )}
          </div>
        </section>
      )}

      {actions.length === 0 && (
        <p
          className="rounded-md border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]"
          data-testid="detail-no-actions"
        >
          No admin actions available for bookings in status{' '}
          <strong>{formatStatus(row.status)}</strong>. This state is
          terminal.
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-[hsl(var(--muted-foreground))]">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
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
