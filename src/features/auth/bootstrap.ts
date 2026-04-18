/**
 * `BOOTSTRAP_ENABLED` flag helper.
 *
 * Reads `process.env.BOOTSTRAP_ENABLED` fresh on every call so tests can
 * toggle it without module reloads. Only the literal string `"true"`
 * enables bootstrap — anything else (including `"1"`, `"yes"`, missing)
 * is treated as disabled.
 *
 * This tightness is intentional: the production default is "locked"
 * (STACK.md), and a typo shouldn't accidentally open enrollment.
 */

export function isBootstrapEnabled(): boolean {
  return process.env.BOOTSTRAP_ENABLED === 'true';
}
