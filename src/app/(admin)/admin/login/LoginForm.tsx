'use client';

/**
 * Passkey enrollment + login form.
 *
 * Single email input → server action decides (via BOOTSTRAP + admin state)
 * which ceremony to run:
 *
 *   - enrollment: `startEnrollment` → WebAuthn create → `finishEnrollment`
 *     → recovery-code modal → dismiss → /admin
 *   - login:      `startLogin`      → WebAuthn get    → `finishLogin`
 *                 → /admin
 *
 * Only two client-visible outcomes exist per the no-enumeration rule:
 *   1. success (continue / show recovery code)
 *   2. the canonical failure message
 *
 * The form never tells the user whether their email was valid, whether
 * bootstrap is enabled, or what specifically went wrong.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import {
  startEnrollment as startEnrollmentAction,
  finishEnrollment as finishEnrollmentAction,
} from '@/features/auth/enrollment';
import {
  startLogin as startLoginAction,
  finishLogin as finishLoginAction,
} from '@/features/auth/login';
import { RecoveryCodeModal } from './RecoveryCodeModal';

type Stage = 'idle' | 'working' | 'recovery-modal';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stage === 'working') return;
    if (!email.trim()) {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      return;
    }
    setStage('working');

    // Try login path first. If the admin is in pending-enrollment state,
    // startLogin returns the canonical failure (because `status !== enrolled`).
    // We then try the enrollment path. A genuinely-unknown email fails both
    // and the user sees the canonical error — no enumeration leak.
    const loginRes = await startLoginAction(email);
    if (loginRes.ok) {
      try {
        const asserted = await startAuthentication({ optionsJSON: loginRes.options });
        const finish = await finishLoginAction(email, asserted);
        if (!finish.ok) {
          setError(finish.message);
          setStage('idle');
          return;
        }
        router.push('/admin');
        router.refresh();
        return;
      } catch {
        setError(AUTH_GENERIC_FAILURE_MESSAGE);
        setStage('idle');
        return;
      }
    }

    // Fall through to enrollment path.
    const enrollRes = await startEnrollmentAction(email);
    if (!enrollRes.ok) {
      setError(enrollRes.message);
      setStage('idle');
      return;
    }
    try {
      const attestation = await startRegistration({ optionsJSON: enrollRes.options });
      const finish = await finishEnrollmentAction(email, attestation);
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
          />
        </label>

        <Button
          type="submit"
          className="w-full"
          disabled={stage === 'working' || stage === 'recovery-modal'}
          data-testid="submit-button"
        >
          {stage === 'working' ? 'Working…' : 'Continue'}
        </Button>

        {error && (
          <p className="text-sm text-[hsl(var(--destructive))]" data-testid="auth-error" role="alert">
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
