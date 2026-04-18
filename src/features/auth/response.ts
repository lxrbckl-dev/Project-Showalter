/**
 * Single canonical failure response for all admin auth server actions.
 *
 * Returned for:
 *   - unknown email
 *   - email known but not active
 *   - email known and active but not enrolled and BOOTSTRAP_ENABLED=false
 *   - WebAuthn verification failure
 *   - rate-limit exceeded
 *   - expired / missing challenge
 *   - recovery-code mismatch
 *
 * The message body, status code, and response shape are IDENTICAL across
 * all of these paths — anything else would leak whether a given email is
 * a valid admin. Log the real reason server-side only (see `logAuthFailure`).
 *
 * HTTP status is implicit: server actions return this object from within a
 * `200 OK` response, and callers MUST NOT vary status codes by failure type.
 */

export const AUTH_GENERIC_FAILURE_MESSAGE =
  "Couldn't sign in — try again or use your recovery code";

export type AuthFailure = {
  ok: false;
  message: string;
};

export type AuthOk<T = Record<string, never>> = {
  ok: true;
} & T;

export type AuthResult<T = Record<string, never>> = AuthOk<T> | AuthFailure;

/** Canonical failure response. Always returns the same object shape. */
export function authFailure(): AuthFailure {
  return { ok: false, message: AUTH_GENERIC_FAILURE_MESSAGE };
}

/** Canonical success response. Merge any extra fields in `payload`. */
export function authOk<T extends object = Record<string, never>>(payload?: T): AuthOk<T> {
  return { ok: true, ...(payload ?? ({} as T)) };
}

/**
 * Server-side-only log for the real reason a request was rejected. Intentionally
 * not shipped to the client.
 */
export function logAuthFailure(reason: string, context?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      msg: 'auth: rejected',
      reason,
      ...(context ?? {}),
    }),
  );
}
