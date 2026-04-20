'use client';

/**
 * Passkey login form — single-admin install.
 *
 * No email input: clicking the button calls `startLoginAuto` which
 * resolves the lone enrolled admin server-side, then runs the standard
 * WebAuthn `get()` ceremony. Browser passkey UI handles selection if
 * multiple devices are enrolled to the same account.
 *
 * No-enumeration rule still holds: client-visible outcomes are success +
 * the single canonical failure message.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import {
  startLogin as startLoginAction,
  finishLogin as finishLoginAction,
} from '@/features/auth/login';

type Stage = 'idle' | 'working';

export function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stage === 'working') return;
    setStage('working');

    const loginRes = await startLoginAction();
    if (!loginRes.ok) {
      setError(loginRes.message);
      setStage('idle');
      return;
    }

    try {
      const asserted = await startAuthentication({ optionsJSON: loginRes.options });
      const finish = await finishLoginAction(asserted);
      if (!finish.ok) {
        setError(finish.message);
        setStage('idle');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      setStage('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Button
        type="submit"
        className="w-full"
        disabled={stage === 'working'}
        data-testid="submit-button"
      >
        {stage === 'working' ? 'Signing in…' : 'Sign in with passkey'}
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
  );
}
