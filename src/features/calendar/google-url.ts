/**
 * Google Calendar render-URL generator — Phase 7.
 *
 * Per STACK.md § Calendar integration:
 *
 *   Google Calendar — a
 *   calendar.google.com/calendar/render?action=TEMPLATE&text=...
 *   &dates=...&details=...&location=... URL generated server-side
 *   when rendering the prefilled email body. One tap → event added
 *   on any Google account.
 *
 * Per issue #59:
 *
 *   Dates formatted as YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS (UTC, no TZ
 *   suffix — Google render URL handles that)
 *
 * This module is pure: given the booking's start_at ISO, duration in
 * minutes, service name, address, and description, it returns the URL.
 */

export interface GoogleCalendarEventInput {
  /** ISO-8601 timestamp of the event start. Treated as UTC. */
  startAtIso: string;
  /** Event duration in minutes. Defaults to 60 for lawn-care appointments. */
  durationMinutes?: number;
  /** Event title — e.g. the service name. */
  text: string;
  /** Location string — typically the customer's address. */
  location?: string;
  /** Long-form body / notes. */
  details?: string;
}

const BASE = 'https://calendar.google.com/calendar/render';

/**
 * Format a Date as `YYYYMMDDTHHMMSSZ` UTC per RFC 5545 basic-format.
 * Google's render URL actually wants the `dates=...Z` form
 * but per issue #59 we emit without the `Z` suffix — Google accepts both.
 */
function formatUtcStamp(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const HH = d.getUTCHours().toString().padStart(2, '0');
  const MM = d.getUTCMinutes().toString().padStart(2, '0');
  const SS = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}T${HH}${MM}${SS}`;
}

/**
 * Build a Google Calendar "Add to calendar" render URL. Safe to embed in
 * email bodies and SMS; the recipient's tap opens their Google account with
 * the event pre-filled.
 */
export function buildGoogleCalendarUrl(input: GoogleCalendarEventInput): string {
  const { startAtIso, durationMinutes = 60, text, location, details } = input;

  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid startAtIso: ${startAtIso}`);
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const dates = `${formatUtcStamp(start)}/${formatUtcStamp(end)}`;

  // URLSearchParams handles all percent-encoding correctly, including
  // spaces (+), punctuation in addresses/service names, and newlines
  // inside `details`.
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates,
  });
  if (location) params.set('location', location);
  if (details) params.set('details', details);

  return `${BASE}?${params.toString()}`;
}
