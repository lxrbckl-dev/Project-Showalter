'use client';

/**
 * Founding-admin enrollment form.
 *
 * Rendered by `/admin/login` when the `admins` table is empty. The first
 * visitor to complete the WebAuthn ceremony claims the founding admin
 * slot — the transactional guard in `finishFoundingEnrollment` is the
 * authoritative winner-picker, this form just provides the UX.
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
} from '@/features/auth/found';
import { RecoveryCodeModal } from './RecoveryCodeModal';

type Stage = 'idle' | 'working' | 'recovery-modal';

export function FoundingAdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stage === 'working' || stage === 'recovery-modal') return;
    if (!email.trim()) {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      return;
    }
    setStage('working');

    const start = await startFoundingAction(email);
    if (!start.ok) {
      setError(start.message);
      setStage('idle');
      return;
    }

    try {
      const attestation = await startRegistration({ optionsJSON: start.options });
      const finish = await finishFoundingAction(email, attestation);
      if (!finish.ok) {
        setError(finish.message);
        setStage('idle');
        return;
      }
      setRecoveryCode(finish.recoveryCode);
      setStage('recovery-modal');
    } catch {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      setStage('idle');
    }
  }

  function handleDismissRecoveryModal() {
    setRecoveryCode(null);
    setStage('idle');
    router.push('/admin');
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-[hsl(var(--muted-foreground))]">Email</span>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={stage === 'working' || stage === 'recovery-modal'}
            data-testid="email-input"
            data-founding="true"
          />
        </label>

        <Button
          type="submit"
          className="w-full"
          disabled={stage === 'working' || stage === 'recovery-modal'}
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

      {stage === 'recovery-modal' && recoveryCode && (
        <RecoveryCodeModal code={recoveryCode} onDismiss={handleDismissRecoveryModal} />
      )}
    </>
  );
}
