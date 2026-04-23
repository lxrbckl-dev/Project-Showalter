'use client';

/**
 * Invite-acceptance client form.
 *
 * The email field is PRE-FILLED from the server's invited_email lookup and
 * rendered read-only. Defense-in-depth against typos and to surface that the
 * invite is email-bound; the server action re-validates the binding inside
 * the accept transaction.
 *
 * Flow:
 *   1. `startAcceptInvite(token, email)` → WebAuthn registration options
 *   2. `startRegistration` (browser ceremony)
 *   3. `finishAcceptInvite(token, email, attestation)` → new admin row +
 *      plaintext recovery code. Session is NOT minted yet.
 *   4. Show recovery-code modal.
 *   5. On dismiss → call `finalizeInviteSession({ adminId, credentialId })`
 *      to mint the session, then route to /admin.
 *
 * Deferring session minting until step 5 avoids the RSC-refresh-unmount
 * bug that would otherwise eat the one-time recovery code (see
 * `FoundingAdminForm` for the founding-flow analogue).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import {
  startAcceptInvite,
  finishAcceptInvite,
  finalizeInviteSession,
} from '@/features/auth/invites';
import { RecoveryCodeModal } from '../login/RecoveryCodeModal';

type Props = {
  token: string;
  invitedEmail: string;
  expiresAt: string;
};

type Stage = 'idle' | 'working' | 'recovery-modal' | 'finalizing';

type PendingSession = {
  adminId: number;
  credentialId: string;
};

function formatExpires(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function InviteSignupForm({ token, invitedEmail, expiresAt }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSession | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stage !== 'idle') return;
    if (!name.trim()) {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      return;
    }
    setStage('working');

    const start = await startAcceptInvite(token, invitedEmail);
    if (!start.ok) {
      setError(start.message);
      setStage('idle');
      return;
    }

    try {
      const attestation = await startRegistration({ optionsJSON: start.options });
      const finish = await finishAcceptInvite(token, invitedEmail, name, attestation);
      if (!finish.ok) {
        setError(finish.message);
        setStage('idle');
        return;
      }
      // Admin row + credential + recovery-code row are written; no session yet.
      setPending({ adminId: finish.adminId, credentialId: finish.credentialId });
      setRecoveryCode(finish.recoveryCode);
      setStage('recovery-modal');
    } catch {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      setStage('idle');
    }
  }

  async function handleDismissRecoveryModal() {
    if (!pending) return;
    setStage('finalizing');
    setError(null);
    const result = await finalizeInviteSession(pending);
    if (!result.ok) {
      // Keep the modal up so the recovery code remains visible. Surface the
      // error so the user knows to sign in manually if finalize keeps failing.
      setError(result.message);
      setStage('recovery-modal');
      return;
    }
    setRecoveryCode(null);
    setPending(null);
    setStage('idle');
    router.push('/admin');
    router.refresh();
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        data-testid="invite-signup-form"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-[hsl(var(--muted-foreground))]">
            Name
          </span>
          <Input
            type="text"
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={stage !== 'idle'}
            data-testid="invite-signup-name"
            placeholder="Your name"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-[hsl(var(--muted-foreground))]">
            Email (from invite)
          </span>
          <Input
            type="email"
            name="email"
            value={invitedEmail}
            readOnly
            aria-readonly="true"
            data-testid="invite-signup-email"
          />
          <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Invite valid until {formatExpires(expiresAt)}.
          </span>
        </label>

        <Button
          type="submit"
          className="w-full"
          disabled={stage !== 'idle'}
          data-testid="invite-signup-submit"
        >
          {stage === 'working' ? 'Enrolling…' : 'Enroll passkey'}
        </Button>

        {error && (
          <p
            className="text-sm text-[hsl(var(--destructive))]"
            data-testid="invite-signup-error"
            role="alert"
          >
            {error}
          </p>
        )}
      </form>

      {(stage === 'recovery-modal' || stage === 'finalizing') && recoveryCode && (
        <RecoveryCodeModal
          code={recoveryCode}
          onDismiss={handleDismissRecoveryModal}
          busy={stage === 'finalizing'}
        />
      )}
    </>
  );
}
