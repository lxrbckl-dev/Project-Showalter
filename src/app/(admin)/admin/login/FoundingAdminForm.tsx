'use client';

/**
 * Founding-admin enrollment form.
 *
 * Rendered by `/admin/login` when the `admins` table is empty. The first
 * visitor to complete the WebAuthn ceremony claims the founding admin
 * slot — the transactional guard in `finishFoundingEnrollment` is the
 * authoritative winner-picker, this form just provides the UX.
 *
 * Session minting is deferred until AFTER the recovery-code modal is
 * dismissed (via `finalizeFoundingEnrollment`). Minting during
 * `finishFoundingEnrollment` would set a session cookie, RSC would refresh
 * `/admin/login`, see a non-empty admins table, and swap this component out
 * for `LoginForm` — unmounting us before we can flush the recovery modal.
 * The user would permanently lose the one-time recovery code.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import {
  startFoundingEnrollment as startFoundingAction,
  finishFoundingEnrollment as finishFoundingAction,
  finalizeFoundingSession as finalizeFoundingAction,
} from '@/features/auth/found';
import { RecoveryCodeModal } from './RecoveryCodeModal';

type Stage = 'idle' | 'working' | 'recovery-modal' | 'finalizing';

type PendingSession = {
  adminId: number;
  credentialId: string;
};

export function FoundingAdminForm() {
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

    const start = await startFoundingAction();
    if (!start.ok) {
      setError(start.message);
      setStage('idle');
      return;
    }

    try {
      const attestation = await startRegistration({ optionsJSON: start.options });
      const finish = await finishFoundingAction(name, attestation);
      if (!finish.ok) {
        setError(finish.message);
        setStage('idle');
        return;
      }
      // Admin row now exists server-side but no session has been minted yet.
      // Show the recovery code first; mint the session on dismiss.
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
    const result = await finalizeFoundingAction(pending);
    if (!result.ok) {
      // Session mint failed. Keep the modal up so the user doesn't lose the
      // code, but surface the failure so they know to re-login manually.
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-[hsl(var(--muted-foreground))]">Name</span>
          <Input
            type="text"
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={stage !== 'idle'}
            data-testid="name-input"
            data-founding="true"
            placeholder="Sawyer"
          />
        </label>

        <Button
          type="submit"
          className="w-full"
          disabled={stage !== 'idle'}
          data-testid="submit-button"
          data-founding="true"
        >
          {stage === 'working' ? 'Enrolling…' : 'Claim founding admin'}
        </Button>

        {error && (
          <p
            className="text-sm text-[hsl(var(--destructive))]"
            data-testid="auth-error"
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
