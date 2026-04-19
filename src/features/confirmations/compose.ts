/**
 * Confirmation compose helper — Phase 7.
 *
 * Given a booking id + template type, return the URL-encoded strings the
 * admin UI needs to build `mailto:` / `sms:` hrefs. This module keeps the
 * interpolation + vars wiring on the server so the client component stays
 * minimal — it just reads the returned object and plugs it into an <a>.
 *
 * Returned strings are already URL-encoded with `encodeURIComponent` so
 * the client can splat them into `mailto:?body=` / `sms:?body=` without
 * re-encoding.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import { siteConfig } from '@/db/schema/site-config';
import { renderTemplate } from '@/features/templates/render';
import { buildTemplateVars } from '@/features/templates/vars';

export type ConfirmationTemplateKind =
  | 'confirmation_email'
  | 'confirmation_sms'
  | 'decline_email'
  | 'decline_sms'
  | 'review_request_email'
  | 'review_request_sms'
  | 'reschedule_email'
  | 'reschedule_sms';

/** Shipped default bodies, used when the admin hasn't overridden the column. */
const DEFAULT_BODIES: Record<ConfirmationTemplateKind, string> = {
  confirmation_email: `Hi [name],

Confirming your appointment:

• Service: [service]
• Date: [date]
• Time: [time]
• Address: [address]

Add to calendar:
• Google: [google_link]
• Apple:  [ics_link]

— Sawyer
913-309-7340`,
  confirmation_sms: `Hi [name], this is Sawyer — you're confirmed for [service] on [date] at [time]. Reply here if anything changes. Add to calendar: [shortlink]`,
  decline_email: `Hi [name],

Thanks for reaching out about [service] on [date]. Unfortunately I'm not able to take it on that day — if a different date works, feel free to submit another request!

— Sawyer
913-309-7340`,
  decline_sms: `Hi [name], Sawyer here — can't do [service] on [date], sorry! If another day works feel free to book again.`,
  review_request_email: `Hi [name],

Thanks for letting me work on your [service] today! If you have a quick moment, I'd really appreciate a review — it helps a lot:

[link]

— Sawyer
913-309-7340`,
  review_request_sms: `Hi [name], thanks for the job today! If you have a sec, a quick review would mean a lot: [link] — Sawyer`,
  reschedule_email: `Hi [name],

Quick update — I've rescheduled your [service] appointment.

New date and time:
• [date] at [time]
• Address: [address]

Add to calendar:
• Google: [google_link]
• Apple:  [ics_link]

Sorry for any inconvenience!

— Sawyer
913-309-7340`,
  reschedule_sms: `Hi [name], Sawyer here — heads up your [service] has been rescheduled to [date] at [time]. Add to calendar: [shortlink]`,
};

/**
 * Default email subjects. Two of them append the site title (admin-editable
 * via `site_config.site_title`) so a future rebrand flows through to the
 * subject line without a code change. The review-request subject doesn't
 * include the brand — it reads like a casual personal ask and the brand
 * showing up there would make it feel more transactional.
 */
function buildDefaultSubjects(
  siteTitle: string,
): Record<'email' | 'decline' | 'review' | 'reschedule', string> {
  return {
    email: `Your appointment is confirmed — ${siteTitle}`,
    decline: `About your service request — ${siteTitle}`,
    review: 'Quick favor — leave a review?',
    reschedule: `Your appointment has been rescheduled — ${siteTitle}`,
  };
}

function subjectForKind(kind: ConfirmationTemplateKind, siteTitle: string): string {
  const subjects = buildDefaultSubjects(siteTitle);
  if (kind === 'confirmation_email') return subjects.email;
  if (kind === 'decline_email') return subjects.decline;
  if (kind === 'review_request_email') return subjects.review;
  if (kind === 'reschedule_email') return subjects.reschedule;
  // SMS kinds don't use a subject.
  return '';
}

export interface ComposedConfirmation {
  kind: ConfirmationTemplateKind;
  /** Present for email kinds only; undefined for SMS kinds. */
  email?: {
    to: string;
    subject: string;
    /** Already URL-encoded. */
    encodedSubject: string;
    /** The raw interpolated body (human-readable). */
    body: string;
    /** The interpolated body, already URL-encoded. */
    encodedBody: string;
    /** Ready-to-use href — e.g. `mailto:jane@example.com?subject=...&body=...`. */
    href: string;
  };
  /** Present for SMS kinds only. */
  sms?: {
    /** E.164 phone number used as the `sms:` target. */
    to: string;
    /** Raw interpolated body. */
    body: string;
    /** Body, already URL-encoded. */
    encodedBody: string;
    /** Ready-to-use href — e.g. `sms:+19135551234?body=...`. */
    href: string;
  };
}

export interface ComposeError {
  ok: false;
  reason:
    | 'not_found'
    | 'missing_email'
    | 'missing_phone';
}

export type ComposeResult =
  | ({ ok: true } & ComposedConfirmation)
  | ComposeError;

function isEmailKind(kind: ConfirmationTemplateKind): boolean {
  return kind.endsWith('_email');
}

function templateFieldFor(kind: ConfirmationTemplateKind):
  | 'templateConfirmationEmail'
  | 'templateConfirmationSms'
  | 'templateDeclineEmail'
  | 'templateDeclineSms'
  | 'templateReviewRequestEmail'
  | 'templateReviewRequestSms'
  | 'templateRescheduleEmail'
  | 'templateRescheduleSms' {
  switch (kind) {
    case 'confirmation_email':
      return 'templateConfirmationEmail';
    case 'confirmation_sms':
      return 'templateConfirmationSms';
    case 'decline_email':
      return 'templateDeclineEmail';
    case 'decline_sms':
      return 'templateDeclineSms';
    case 'review_request_email':
      return 'templateReviewRequestEmail';
    case 'review_request_sms':
      return 'templateReviewRequestSms';
    case 'reschedule_email':
      return 'templateRescheduleEmail';
    case 'reschedule_sms':
      return 'templateRescheduleSms';
  }
}

export interface ComposeOptions {
  /** Base URL used for absolute links (google/ics/shortlink). */
  baseUrl?: string;
  /** Optional review link for [link] placeholder. */
  reviewLink?: string;
}

/**
 * Compose the email/SMS payload for a booking + template kind.
 *
 * Returns `{ ok: false, reason: ... }` on:
 *   - booking id not found
 *   - email kind selected but customer has no email
 *   - sms kind selected but customer has no phone (shouldn't happen —
 *     phone is NOT NULL — but defensive nonetheless)
 */
export function composeConfirmationForBooking(
  bookingId: number,
  kind: ConfirmationTemplateKind,
  opts: ComposeOptions = {},
): ComposeResult {
  const db = getDb();
  const row = db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
    .all()[0];
  if (!row) return { ok: false, reason: 'not_found' };

  const svc = db
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, row.serviceId))
    .limit(1)
    .all()[0];
  const cfg = db.select().from(siteConfig).limit(1).all()[0];

  const timezone = cfg?.timezone ?? 'America/Chicago';
  const siteTitle = cfg?.siteTitle ?? 'Sawyer Showalter Service';
  const baseUrl = (opts.baseUrl ?? process.env.BASE_URL ?? 'https://showalter.business').replace(
    /\/+$/,
    '',
  );

  // Body: admin override column (if set) or shipped default.
  const field = templateFieldFor(kind);
  const bodyTemplate =
    (cfg && typeof cfg[field] === 'string' && cfg[field] !== ''
      ? cfg[field]
      : null) ?? DEFAULT_BODIES[kind];

  const vars = buildTemplateVars({
    customerName: row.customerName,
    serviceName: svc?.name ?? null,
    startAtIso: row.startAt,
    addressText: row.addressText,
    notes: row.notes ?? null,
    timezone,
    baseUrl,
    token: row.token,
    reviewLink: opts.reviewLink,
  });

  const body = renderTemplate(bodyTemplate, vars);
  const encodedBody = encodeURIComponent(body);

  if (isEmailKind(kind)) {
    const to = row.customerEmail;
    if (!to) return { ok: false, reason: 'missing_email' };
    const subject = subjectForKind(kind, siteTitle);
    const encodedSubject = encodeURIComponent(subject);
    const href = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
    return {
      ok: true,
      kind,
      email: {
        to,
        subject,
        encodedSubject,
        body,
        encodedBody,
        href,
      },
    };
  }

  const to = row.customerPhone;
  if (!to) return { ok: false, reason: 'missing_phone' };
  const href = `sms:${to}?body=${encodedBody}`;
  return {
    ok: true,
    kind,
    sms: {
      to,
      body,
      encodedBody,
      href,
    },
  };
}
