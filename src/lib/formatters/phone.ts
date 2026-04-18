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
