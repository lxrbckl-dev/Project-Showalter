'use client';

/**
 * ConfirmationButtons — Phase 7.
 *
 * Renders mailto / sms action buttons on the admin booking detail page.
 *
 * Per STACK.md § Confirmation delivery + issue #59:
 *   - Show on status='accepted' → email + sms confirmation
 *   - Show on status='declined' → email + sms decline
 *   - Email button hidden when customer_email is null
 *
 * The hrefs are pre-built server-side by composeConfirmationForBooking and
 * passed in as already-URL-encoded strings, so this component is pure UI.
 */

export interface ConfirmationHref {
  label: string;
  href: string;
  kind: 'email' | 'sms';
  testid: string;
  /**
   * When true, disables the button and shows a tooltip — e.g. email when
   * customer has no email on file.
   */
  disabled?: boolean;
  disabledReason?: string;
}

export function ConfirmationButtons({
  hrefs,
}: {
  hrefs: ConfirmationHref[];
}) {
  if (hrefs.length === 0) return null;
  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="confirmation-buttons"
    >
      {hrefs.map((h) => {
        const base =
          'rounded-md px-4 py-2 text-sm font-medium inline-block';
        if (h.disabled) {
          return (
            <button
              key={h.testid}
              type="button"
              disabled
              title={h.disabledReason}
              data-testid={h.testid}
              className={`${base} bg-gray-700 text-gray-300 opacity-60`}
            >
              {h.label}
            </button>
          );
        }
        const variant =
          h.kind === 'email'
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'bg-green-600 text-white hover:bg-green-500';
        return (
          <a
            key={h.testid}
            href={h.href}
            data-testid={h.testid}
            className={`${base} ${variant}`}
          >
            {h.label}
          </a>
        );
      })}
    </div>
  );
}
