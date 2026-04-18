/**
 * Pure validation helpers for availability windows. Shared by the resolver,
 * the start-time generator, and the server-action layer. No DB access.
 *
 *   - `parseTimeToMinutes` — 'HH:MM' → minutes since midnight (0..1439)
 *   - `formatMinutesAsTime` — inverse
 *   - `isValidTimeFormat` — string shape check
 *   - `isValidDateFormat`  — YYYY-MM-DD shape check
 *   - `windowsOverlap`     — pairwise overlap predicate over [start, end)
 *   - `validateWindowSet`  — aggregate validator used by server actions
 */

export type ValidatedWindow = { startTime: string; endTime: string };

const TIME_RE = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeFormat(s: string): boolean {
  return TIME_RE.test(s);
}

export function isValidDateFormat(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  // Catch impossible dates like 2026-13-40.
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Round-trip through Date to reject '2026-02-30' etc.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function parseTimeToMinutes(s: string): number {
  const match = TIME_RE.exec(s);
  if (!match) {
    throw new Error(`Invalid time format: ${s} (expected HH:MM)`);
  }
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Treat windows as half-open [start, end) so a 10:00–12:00 window and a
 * 12:00–14:00 window are considered adjacent, not overlapping.
 */
export function windowsOverlap(a: ValidatedWindow, b: ValidatedWindow): boolean {
  const aStart = parseTimeToMinutes(a.startTime);
  const aEnd = parseTimeToMinutes(a.endTime);
  const bStart = parseTimeToMinutes(b.startTime);
  const bEnd = parseTimeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Validate a set of proposed windows for a single day. Returns the first
 * human-readable error, or `null` on success. Server actions surface the
 * string verbatim to the caller.
 */
export function validateWindowSet(windows: ValidatedWindow[]): string | null {
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (!isValidTimeFormat(w.startTime) || !isValidTimeFormat(w.endTime)) {
      return `Window ${i + 1}: times must be in HH:MM 24-hour format.`;
    }
    const s = parseTimeToMinutes(w.startTime);
    const e = parseTimeToMinutes(w.endTime);
    if (e <= s) {
      return `Window ${i + 1}: end time must be after start time.`;
    }
  }
  // Pairwise overlap (quadratic, but windows-per-day is a handful at most).
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (windowsOverlap(windows[i], windows[j])) {
        return `Windows ${i + 1} and ${j + 1} overlap.`;
      }
    }
  }
  return null;
}
