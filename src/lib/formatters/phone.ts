/**
 * formatUSPhone — converts an E.164 US number to the (NXX) NXX-XXXX display format.
 *
 * Examples:
 *   '+19133097340' → '(913) 309-7340'
 *   '9133097340'   → '(913) 309-7340'  (10-digit fallback)
 *
 * Returns the raw string unchanged if it cannot be parsed as a 10-digit US number.
 */
export function formatUSPhone(phone: string): string {
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '');

  // Accept 10-digit or 11-digit with leading '1'
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (local.length !== 10) {
    return phone;
  }

  const area = local.slice(0, 3);
  const prefix = local.slice(3, 6);
  const line = local.slice(6, 10);

  return `(${area}) ${prefix}-${line}`;
}

/**
 * normalizeUSPhone — accept common human-typed US phone inputs and return an
 * E.164 string of the form `+1XXXXXXXXXX`.
 *
 * Accepts (all equivalent):
 *   '(913) 309-7340'
 *   '913-309-7340'
 *   '913.309.7340'
 *   '913 309 7340'
 *   '9133097340'
 *   '+1 913 309 7340'
 *   '1-913-309-7340'
 *
 * Rules (per STACK.md § Conventions): strip everything except digits, then
 * require exactly 10 significant digits (or 11 starting with '1'). NANP also
 * requires that the area code and exchange both start with 2-9 — we enforce
 * that to reject obvious garbage like '0000000000' or '11234567890'.
 *
 * We deliberately use a US-only regex rather than libphonenumber-js — Sawyer
 * serves the Kansas City metro and will never see international numbers. A
 * simple validator is smaller, faster, and has no upstream version pin.
 *
 * Returns null when the input cannot be normalized. Callers decide whether
 * to surface a field-level error or reject the whole submission.
 */
export function normalizeUSPhone(input: string | null | undefined): string | null {
  if (input == null) return null;

  // Strip to digits only.
  const digits = input.replace(/\D/g, '');

  // Accept '1XXXXXXXXXX' (11 digits) or 'XXXXXXXXXX' (10 digits).
  let local: string;
  if (digits.length === 11 && digits.startsWith('1')) {
    local = digits.slice(1);
  } else if (digits.length === 10) {
    local = digits;
  } else {
    return null;
  }

  // NANP sanity: area code + exchange both start with 2-9.
  // Example: '1234567890' → area '123' starts with '1' → reject.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(local)) {
    return null;
  }

  return `+1${local}`;
}
