'use client';

/**
 * Full-screen recovery-code disclosure modal.
 *
 * Shown exactly once after successful enrollment. The plaintext code is
 * never transmitted again — only a hash lives in the DB. The dismissal
 * button is gated on an explicit "I've saved this" confirmation checkbox
 * to prevent accidental loss.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  code: string;
  onDismiss: () => void;
  /**
   * True while the caller is finalizing the flow (e.g. minting a session) in
   * response to the dismiss click. Disables the dismiss button to prevent
   * double-invocation. Enrollment complete server-side — if the async
   * follow-up fails the caller surfaces that state; modal stays up.
   */
  busy?: boolean;
};

export function RecoveryCodeModal({ code, onDismiss, busy = false }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      // Clipboard may be unavailable (no HTTPS in some dev contexts);
      // still show the code, user can copy manually.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      data-testid="recovery-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 shadow-lg">
        <h2 id="recovery-title" className="text-xl font-semibold tracking-tight">
          Save your recovery code
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          This one-time code lets you recover admin access if you lose your
          passkey. It will never be shown again. Write it down, save it to a
          password manager, or keep it somewhere safe.
        </p>

        <div
          className="mt-6 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-6 text-center font-mono text-2xl tracking-widest"
          data-testid="recovery-code"
        >
          {code}
        </div>

        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={handleCopy} data-testid="copy-button">
            {copyOk ? 'Copied' : 'Copy to clipboard'}
          </Button>
        </div>

        <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            data-testid="confirm-saved-checkbox"
            className="h-4 w-4"
          />
          I&apos;ve saved this code somewhere safe
        </label>

        <div className="mt-6 flex justify-end">
          <Button
            onClick={onDismiss}
            disabled={!confirmed || busy}
            data-testid="dismiss-modal-button"
          >
            {busy ? 'Signing in…' : 'Continue to dashboard'}
          </Button>
        </div>
      </div>
    </div>
  );
}
