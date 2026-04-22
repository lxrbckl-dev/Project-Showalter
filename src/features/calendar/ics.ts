/**
 * .ics (iCalendar, RFC 5545) generator — Phase 7.
 *
 * Per STACK.md:
 *
 *   - /bookings/<token>/ics returns Content-Type: text/calendar
 *   - VCALENDAR + VEVENT with UID from booking token,
 *     DTSTART with TZID (timezone from site_config),
 *     SUMMARY = service name, LOCATION = address_text,
 *     DESCRIPTION with notes
 *   - VALARM reminder 24h before (see Conventions)
 *
 * We emit a minimal but valid VCALENDAR. Mobile calendars (Apple Calendar,
 * Google Calendar on iOS) are tolerant of slightly-truncated TZ definitions
 * — they use the TZID string to look up the timezone in their own database
 * rather than relying on the VTIMEZONE block. We still include a minimal
 * VTIMEZONE stub because RFC 5545 section 3.6.5 requires a VTIMEZONE
 * component to be present for any TZID referenced in the calendar object.
 *
 * Line folding (RFC 5545 §3.1): long lines are folded at 75 octets with
 * a CRLF + SPACE continuation. We keep our lines short enough that folding
 * is rarely needed, but the helper handles it for safety.
 */

export interface IcsBookingInput {
  /** Unguessable token used for the UID and the /c/<token> shortlink. */
  token: string;
  /** ISO-8601 timestamp of the event start (UTC). */
  startAtIso: string;
  /** Event duration in minutes. Defaults to 60 (per STACK.md). */
  durationMinutes?: number;
  /** Service name used as the VEVENT SUMMARY. */
  summary: string;
  /** Address snapshot used as the VEVENT LOCATION. */
  location: string;
  /** Customer-submitted notes used as the VEVENT DESCRIPTION. */
  description?: string;
  /** Site timezone for the DTSTART/DTEND TZID (e.g. "America/Chicago"). */
  timezone: string;
  /**
   * Optional. Seconds-since-epoch "now" for DTSTAMP. Defaults to Date.now().
   * Exposed so tests can make DTSTAMP deterministic.
   */
  now?: Date;
  /**
   * `'publish'` (default) emits a normal event the calendar app adds.
   * `'cancel'` emits METHOD:CANCEL + STATUS:CANCELLED + SEQUENCE:1 with the
   * same UID. iOS Calendar honors this and offers "Remove from Calendar";
   * Google / Outlook may render it as a separate "Canceled" event instead.
   */
  method?: 'publish' | 'cancel';
}

const CRLF = '\r\n';

/**
 * Escape a value per RFC 5545 §3.3.11 (text property value):
 *   - Backslashes, semicolons, and commas must be escaped.
 *   - Newlines inside a value are encoded as literal "\n".
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Fold a single logical line to <=75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string {
  // Fast path: most of our lines are short.
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;

  const out: string[] = [];
  let remaining = line;
  // First chunk: up to 75 octets.
  while (Buffer.byteLength(remaining, 'utf8') > 75) {
    // Find the split point by scanning octets.
    let len = 0;
    let bytes = 0;
    for (; len < remaining.length; len++) {
      const charBytes = Buffer.byteLength(remaining[len], 'utf8');
      if (bytes + charBytes > 75) break;
      bytes += charBytes;
    }
    out.push(remaining.slice(0, len));
    remaining = ' ' + remaining.slice(len);
  }
  out.push(remaining);
  return out.join(CRLF);
}

function formatUtcStamp(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const HH = d.getUTCHours().toString().padStart(2, '0');
  const MM = d.getUTCMinutes().toString().padStart(2, '0');
  const SS = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}T${HH}${MM}${SS}Z`;
}

/**
 * Format a Date as a "floating" local-time stamp (YYYYMMDDTHHMMSS) using
 * the given IANA timezone. Used for DTSTART;TZID=... per RFC 5545 §3.3.5.
 *
 * We use `Intl.DateTimeFormat` (with `en-CA` to get ISO-shaped output) to
 * project the UTC instant into the target timezone without pulling in a
 * full tz library.
 */
function formatLocalStampInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: string): string =>
    parts.find((p) => p.type === t)?.value ?? '00';
  // `hour12: false` still emits "24" at midnight in some engines — normalize.
  const hour = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}${g('month')}${g('day')}T${hour}${g('minute')}${g('second')}`;
}

/**
 * Render the .ics file body. The output uses CRLF line endings as the spec
 * requires and is safe to send as `Content-Type: text/calendar; charset=utf-8`.
 */
export function buildIcs(input: IcsBookingInput): string {
  const {
    token,
    startAtIso,
    durationMinutes = 60,
    summary,
    location,
    description,
    timezone,
    now = new Date(),
    method = 'publish',
  } = input;
  const isCancel = method === 'cancel';

  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid startAtIso: ${startAtIso}`);
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const uid = `booking-${token}@sawyer.showalter.business`;
  const dtstamp = formatUtcStamp(now);
  const dtstart = formatLocalStampInTz(start, timezone);
  const dtend = formatLocalStampInTz(end, timezone);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Showalter Services//Booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${isCancel ? 'CANCEL' : 'PUBLISH'}`,
    // Minimal VTIMEZONE stub — Apple Calendar / Google Calendar look up
    // the TZID string in their own tz database rather than parsing the
    // standard/daylight components, so this suffices.
    'BEGIN:VTIMEZONE',
    `TZID:${timezone}`,
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${timezone}:${dtstart}`,
    `DTEND;TZID=${timezone}:${dtend}`,
    `SUMMARY:${isCancel ? 'Canceled: ' : ''}${escapeText(summary)}`,
    `LOCATION:${escapeText(location)}`,
  ];
  if (description) {
    lines.push(`DESCRIPTION:${escapeText(description)}`);
  }
  if (isCancel) {
    // STATUS:CANCELLED + SEQUENCE>0 are required for the calendar app to
    // recognize this as an update to a previously-imported event with the
    // same UID, rather than as a brand-new entry.
    lines.push('STATUS:CANCELLED', 'SEQUENCE:1');
  } else {
    // VALARM: 24-hour reminder (STACK.md § Conventions). Skip on cancel —
    // the event is going away, no point reminding.
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER:-PT24H',
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join(CRLF) + CRLF;
}
