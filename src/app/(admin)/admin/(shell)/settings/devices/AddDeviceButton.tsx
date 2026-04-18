'use client';

/**
 * Client-only entry point for the add-another-device WebAuthn flow.
 *
 * Sequence:
 *   1. Call `startAddDevice` (server action). Server returns registration
 *      options with the admin's existing credentialIds in excludeCredentials
 *      so the browser refuses to re-register the same authenticator.
 *   2. Invoke `startRegistration` from `@simplewebauthn/browser`. The browser
 *      + OS handle the passkey ceremony.
 *   3. Optionally prompt for a device label via the browser `prompt()` —
 *      MVP-simple, per the issue.
 *   4. Call `finishAddDevice` with the attestation + label. Server verifies
 *      the response, inserts the row, and returns success.
 *   5. Refresh the server component to surface the new row.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import { startAddDevice, finishAddDevice } from '@/features/auth/devices';
import { LABEL_MAX_LEN } from '@/features/auth/devices-shared';

export function AddDeviceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [, startTransition] = useTransition();

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const start = await startAddDevice();
      if (!start.ok) {
        setMessage({ kind: 'err', text: start.message });
        return;
      }

      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: start.options });
      } catch (err) {
        const msg =
          err instanceof Error && /InvalidState/i.test(err.name)
            ? 'This device is already registered.'
            : AUTH_GENERIC_FAILURE_MESSAGE;
        setMessage({ kind: 'err', text: msg });
        return;
      }

      // Simple prompt-based label. Empty/whitespace → no label (server will
      // store null and the UI falls back to deviceType).
      let label: string | undefined;
      if (typeof window !== 'undefined') {
        const raw = window.prompt(
          `Name this device (optional, up to ${LABEL_MAX_LEN} chars)`,
          '',
        );
        if (raw !== null) {
          const trimmed = raw.trim();
          if (trimmed.length > 0) {
            label = trimmed.slice(0, LABEL_MAX_LEN);
          }
        }
      }

      const finish = await finishAddDevice(attestation, label);
      if (!finish.ok) {
        setMessage({ kind: 'err', text: finish.message });
        return;
      }

      setMessage({ kind: 'ok', text: 'Device added.' });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={busy}
        data-testid="add-device-button"
      >
        {busy ? 'Registering…' : 'Add another device'}
      </Button>
      {message && (
        <p
          role="status"
          className={
            message.kind === 'ok'
              ? 'text-xs text-[hsl(var(--muted-foreground))]'
              : 'text-xs text-[hsl(var(--destructive))]'
          }
          data-testid="add-device-status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
