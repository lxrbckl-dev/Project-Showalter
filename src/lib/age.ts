/**
 * Age helper — derives an integer age from a date-of-birth string.
 *
 * Used by the public landing page to keep Sawyer's age in the About/Hero copy
 * current automatically. The bio is persisted with an `[age]` placeholder
 * (see `src/features/templates/render.ts` for the bracket-placeholder
 * convention used project-wide) and interpolated at render time against the
 * result of `calculateAge(siteConfig.dateOfBirth, siteConfig.timezone)`.
 *
 * Design decisions:
 *
 *   * DOB is a calendar date (`YYYY-MM-DD`), not an instant — the wall-clock
 *     "today" we compare against must also be a calendar date, and must
 *     respect the site timezone. A site in America/Chicago should flip the
 *     age at local midnight on the birthday, not at UTC midnight. We use
 *     `Intl.DateTimeFormat` (the same primitive used in
 *     `features/templates/vars.ts`) to project "now" into the site zone.
 *
 *   * Leap-day birthdays (Feb 29): in a non-leap year we treat the birthday
 *     as "hit" on Feb 28. This is the standard legal/UX convention (US law,
 *     most date libraries). The alternative — rolling to Mar 1 — would leave
 *     Feb-29 babies a day younger than their same-day peers, which users
 *     find surprising.
 *
 *   * An unset DOB returns `null`. Callers render a graceful fallback
 *     (see `About.tsx`).
 *
 *   * An invalid/malformed DOB returns `null` rather than throwing. This is
 *     defensive — the input is validated before insert by the Zod schema in
 *     `site-config/actions.ts`, but we don't want a one-off malformed row
 *     (e.g. from a future data import) to crash SSR of the landing page.
 */

/**
 * Strict `YYYY-MM-DD` shape — four digit year, two digit month (01-12), two
 * digit day (01-31). Range validation (e.g. Feb 30) is handled by the Date
 * round-trip check below.
 */
const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Parse a `YYYY-MM-DD` string into its numeric parts. Returns `null` for any
 * input that isn't a real calendar date. Accepts `null`/`undefined` as "no
 * DOB" and returns `null`.
 */
function parseIsoDate(
  input: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (input == null) return null;
  const trimmed = input.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Reject impossible days (e.g. 2025-02-30). Round-trip through Date in UTC
  // to avoid DST shenanigans — we only care about calendar validity here.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Project `now` (or the injected clock) into the given IANA timezone and
 * return today's calendar date in that zone. Falls back to the host's local
 * date if the timezone is somehow invalid.
 */
function todayInTimezone(
  timezone: string,
  now: Date,
): { year: number; month: number; day: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value);
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new Error('timezone projection failed');
    }
    return { year, month, day };
  } catch {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }
}

export interface CalculateAgeOptions {
  /** Override "now" for deterministic tests. */
  now?: Date;
  /**
   * IANA timezone to compute "today" in. Defaults to the site timezone used
   * elsewhere (`America/Chicago`). Callers should pass `siteConfig.timezone`.
   */
  timezone?: string;
}

/**
 * Returns Sawyer's integer age today in the given timezone, or `null` if the
 * DOB is unset / malformed / in the future.
 *
 *   calculateAge('2010-06-15', { timezone: 'America/Chicago' })
 *
 * Leap-day handling: a DOB of Feb 29 is treated as having its birthday on
 * Feb 28 in non-leap years (standard behavior).
 */
export function calculateAge(
  dob: string | null | undefined,
  options: CalculateAgeOptions = {},
): number | null {
  const parsed = parseIsoDate(dob);
  if (!parsed) return null;

  const { now = new Date(), timezone = 'America/Chicago' } = options;
  const today = todayInTimezone(timezone, now);

  let age = today.year - parsed.year;

  // Determine the "effective birthday" month/day for this year. Feb 29 in
  // a non-leap year becomes Feb 28.
  const bdMonth = parsed.month;
  let bdDay = parsed.day;
  if (parsed.month === 2 && parsed.day === 29) {
    const isLeap =
      (today.year % 4 === 0 && today.year % 100 !== 0) || today.year % 400 === 0;
    if (!isLeap) {
      bdDay = 28;
    }
  }

  // Birthday not yet reached this calendar year → subtract one.
  if (today.month < bdMonth || (today.month === bdMonth && today.day < bdDay)) {
    age -= 1;
  }

  if (age < 0) return null;
  return age;
}

/**
 * Replace `[age]` placeholders in `text` with the current age (or a graceful
 * fallback when DOB is unset).
 *
 * Matches the bracket-placeholder convention used by the message-template
 * renderer in `features/templates/render.ts`, so Sawyer's mental model stays
 * consistent across bio and templates.
 *
 * Whitespace inside the brackets is tolerated (`[age]` and `[ age ]` both
 * match). Other `[foo]` tokens are left untouched.
 *
 * When the DOB is unset and the text contains `[age]`, we substitute an
 * empty string and collapse the double-space / stray whitespace around it so
 * the sentence doesn't read like "I am a  entrepreneur." Alex can decide
 * later whether to rephrase; in the meantime the page stays readable.
 */
export function interpolateAge(
  text: string | null | undefined,
  dob: string | null | undefined,
  options: CalculateAgeOptions = {},
): string | null {
  if (text == null) return text ?? null;
  if (!text.includes('[age]') && !/\[\s*age\s*\]/i.test(text)) return text;

  const age = calculateAge(dob, options);
  const replacement = age == null ? '' : String(age);

  let out = text.replace(/\[\s*age\s*\]/gi, replacement);

  // If we stripped the placeholder, tidy up any double-space or orphan
  // whitespace left behind (e.g. "I am a  entrepreneur" → "I am a
  // entrepreneur"). Only runs when the replacement was empty.
  if (replacement === '') {
    out = out.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?])/g, '$1');
  }

  return out;
}
