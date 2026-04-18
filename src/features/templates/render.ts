/**
 * Template interpolation — Phase 7.
 *
 * Substitutes bracketed placeholders like `[name]`, `[service]`, `[date]`
 * etc. in a message-template body against a per-booking variable map.
 *
 * Per STACK.md § Message templates:
 *
 *   Unknown variables in a template body are left as literal text
 *   (no crash) — this keeps Sawyer's edits forgiving.
 *
 * That rule is the whole reason this isn't just a `.replace(/\[(\w+)\]/g)` —
 * we have to skip placeholders whose key isn't in the vars map rather than
 * erroring or substituting the empty string.
 *
 * The renderer is intentionally permissive about whitespace: `[name]` and
 * `[ name ]` both match `name`. Variable lookup is case-sensitive to
 * match the canonical placeholder catalog in `./variables.ts`.
 */
export function renderTemplate(
  body: string,
  vars: Readonly<Record<string, string>>,
): string {
  if (!body) return body;
  return body.replace(/\[\s*([a-z_][a-z0-9_]*)\s*\]/gi, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : value;
  });
}
