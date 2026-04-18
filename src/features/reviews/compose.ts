/**
 * Review-request compose helper — Phase 9.
 *
 * Given a review id + kind (`review_request_email` | `review_request_sms`),
 * return the `mailto:` / `sms:` href the admin UI plugs into an <a>. This
 * mirrors the Phase 7 `composeConfirmationForBooking` helper but with
 * review-specific context:
 *
 *   - The customer snapshot is pulled from the `customers` table (since
 *     a review may be standalone — no booking snapshot available).
 *   - The `[service]` variable falls back to "your recent service" when
 *     the review is standalone.
 *   - The `[link]` variable is the absolute URL to `/review/<token>`.
 *
 * The renderer reuses `renderTemplate` and `buildTemplateVars` from Phase 7
 * so admin edits to the template bodies in site_config (via /admin/settings)
 * flow through this helper unchanged.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { customers } from '@/db/schema/customers';
import { reviews } from '@/db/schema/reviews';
import { services } from '@/db/schema/services';
import { siteConfig } from '@/db/schema/site-config';
import { renderTemplate } from '@/features/templates/render';
import { buildTemplateVars } from '@/features/templates/vars';

export type ReviewComposeKind = 'review_request_email' | 'review_request_sms';

const DEFAULT_BODIES: Record<ReviewComposeKind, string> = {
  review_request_email: `Hi [name],

Thanks for letting me work on your [service] today! If you have a quick moment, I'd really appreciate a review — it helps a lot:

[link]

— Sawyer
913-309-7340`,
  review_request_sms: `Hi [name], thanks for the job today! If you have a sec, a quick review would mean a lot: [link] — Sawyer`,
};

const DEFAULT_SUBJECT = 'Quick favor — leave a review?';

export interface ReviewComposed {
  kind: ReviewComposeKind;
  /** The absolute /review/<token> URL used in the body. */
  reviewLink: string;
  email?: {
    to: string;
    subject: string;
    body: string;
    href: string;
  };
  sms?: {
    to: string;
    body: string;
    href: string;
  };
}

export type ReviewComposeResult =
  | ({ ok: true } & ReviewComposed)
  | { ok: false; reason: 'not_found' | 'missing_email' | 'missing_phone' };

export interface ReviewComposeOptions {
  baseUrl?: string;
}

export function composeReviewRequest(
  reviewId: number,
  kind: ReviewComposeKind,
  opts: ReviewComposeOptions = {},
): ReviewComposeResult {
  const db = getDb();
  const row = db
    .select()
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1)
    .all()[0];
  if (!row) return { ok: false, reason: 'not_found' };

  const customer = db
    .select()
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1)
    .all()[0];
  if (!customer) return { ok: false, reason: 'not_found' };

  const cfg = db.select().from(siteConfig).limit(1).all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';
  const baseUrl = (opts.baseUrl ?? process.env.BASE_URL ?? 'https://showalter.business').replace(
    /\/+$/,
    '',
  );

  // Optional: for booking-tied reviews, pull service name + start_at for
  // better template substitution. Standalone reviews fall back.
  let serviceName: string | null = null;
  let startAtIso = row.requestedAt;
  let addressText = '';
  let notes: string | null = null;
  let bookingToken = row.token; // fallback so variables that need a token don't crash
  if (row.bookingId) {
    const booking = db
      .select()
      .from(bookings)
      .where(eq(bookings.id, row.bookingId))
      .limit(1)
      .all()[0];
    if (booking) {
      const svc = db
        .select({ name: services.name })
        .from(services)
        .where(eq(services.id, booking.serviceId))
        .limit(1)
        .all()[0];
      serviceName = svc?.name ?? null;
      startAtIso = booking.startAt;
      addressText = booking.addressText;
      notes = booking.notes ?? null;
      bookingToken = booking.token;
    }
  }

  const reviewLink = `${baseUrl}/review/${row.token}`;

  // Body template: admin override (if set) or shipped default.
  const templateField =
    kind === 'review_request_email'
      ? 'templateReviewRequestEmail'
      : 'templateReviewRequestSms';
  const bodyTemplate =
    (cfg && typeof cfg[templateField] === 'string' && cfg[templateField] !== ''
      ? cfg[templateField]
      : null) ?? DEFAULT_BODIES[kind];

  const vars = buildTemplateVars({
    customerName: customer.name,
    serviceName,
    startAtIso,
    addressText,
    notes,
    timezone: tz,
    baseUrl,
    token: bookingToken,
    reviewLink,
  });

  const body = renderTemplate(bodyTemplate, vars);

  if (kind === 'review_request_email') {
    const to = customer.email;
    if (!to) return { ok: false, reason: 'missing_email' };
    const href = `mailto:${to}?subject=${encodeURIComponent(
      DEFAULT_SUBJECT,
    )}&body=${encodeURIComponent(body)}`;
    return {
      ok: true,
      kind,
      reviewLink,
      email: { to, subject: DEFAULT_SUBJECT, body, href },
    };
  }

  const to = customer.phone;
  if (!to) return { ok: false, reason: 'missing_phone' };
  const href = `sms:${to}?body=${encodeURIComponent(body)}`;
  return {
    ok: true,
    kind,
    reviewLink,
    sms: { to, body, href },
  };
}
