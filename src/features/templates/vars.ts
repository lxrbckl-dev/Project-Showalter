/**
 * Per-booking template variable builder — Phase 7.
 *
 * Given a loaded booking (plus its service name + site timezone), produce
 * the full `Record<string, string>` expected by `renderTemplate`.
 *
 * The variable catalog is documented in STACK.md's "Supported variables
 * per template" table and mirrored in `./variables.ts`. This builder
 * populates every key so any template can interpolate any of them — the
 * SUPPORT_MAP constraints are purely a UI hint, not a runtime guard.
 *
 * Value formatting:
 *   - [date]  →  "Fri, May 1" (en-US, in the site timezone)
 *   - [time]  →  "9:30 AM" (en-US, in the site timezone)
 *
 * These are human-facing strings, not canonical formats — Sawyer's customers
 * see them in a confirmation email / SMS. They're NOT re-parsed anywhere.
 */

import { buildGoogleCalendarUrl } from '@/features/calendar/google-url';

export interface TemplateVarsInput {
  customerName: string;
  /** Service name — e.g. "Mowing". */
  serviceName: string | null;
  /** ISO-8601 UTC timestamp of the appointment start. */
  startAtIso: string;
  /** Snapshotted address text from the booking. */
  addressText: string;
  /** Customer-submitted notes (used in Google details / .ics description). */
  notes: string | null;
  /** IANA timezone for date/time rendering. */
  timezone: string;
  /** Absolute URL root (e.g. "https://showalter.business"). No trailing slash. */
  baseUrl: string;
  /** Unguessable booking token. */
  token: string;
  /**
   * Optional. URL used for the `[link]` placeholder in review-request
   * templates. Left undefined for confirmation/decline templates.
   */
  reviewLink?: string;
  /**
   * First name of the site owner — used for the `[host]` placeholder so
   * message signoffs ("— [host]") follow whatever name the admin sets in
   * Content → Contact. Falls back to "Sawyer" when null.
   */
  hostName?: string | null;
}

/**
 * Format the date portion of a booking in the site timezone.
 * Example: "Fri, May 1".
 */
export function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

/**
 * Format the time portion of a booking in the site timezone.
 * Example: "9:30 AM".
 */
export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function buildTemplateVars(
  input: TemplateVarsInput,
): Record<string, string> {
  const {
    customerName,
    serviceName,
    startAtIso,
    addressText,
    notes,
    timezone,
    baseUrl,
    token,
    reviewLink,
    hostName,
  } = input;

  const service = serviceName ?? 'Service';

  const icsLink = `${baseUrl}/bookings/${token}/ics`;
  const shortlink = `${baseUrl}/c/${token}`;
  const googleLink = buildGoogleCalendarUrl({
    startAtIso,
    text: service,
    location: addressText,
    details: notes ?? undefined,
  });

  return {
    name: customerName,
    service,
    date: formatDate(startAtIso, timezone),
    time: formatTime(startAtIso, timezone),
    address: addressText,
    link: reviewLink ?? '',
    google_link: googleLink,
    ics_link: icsLink,
    shortlink,
    host: hostName?.trim() || 'Sawyer',
  };
}
