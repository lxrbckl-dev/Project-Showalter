'use client';

/**
 * Passkey login form.
 *
 * Single email input → `startLogin` → WebAuthn `get()` → `finishLogin`
 * → redirect to /admin.
 *
 * First-time enrollment for additional admins is NOT handled here anymore —
 * per issue #83, admins are onboarded via single-use invite links at
 * `/admin/signup?token=...`. The only non-invite path that lands in this
 * project is the founding-admin flow (rendered by `/admin/login` when the
 * admins table is empty).
 *
 * No-enumeration rule still holds: client-visible outcomes are success +
 * the single canonical failure message.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import {
  startLogin as startLoginAction,
  finishLogin as finishLoginAction,
} from '@/features/auth/login';

type Stage = 'idle' | 'working';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (stage === 'working') return;
    if (!email.trim()) {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      return;
    }
    setStage('working');

    const loginRes = await startLoginAction(email);
    if (!loginRes.ok) {
      setError(loginRes.message);
      setStage('idle');
      return;
    }

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
    } catch {
      setError(AUTH_GENERIC_FAILURE_MESSAGE);
      setStage('idle');
    }
  }

  return (
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
          disabled={stage === 'working'}
          data-testid="email-input"
        />
      </label>

      <Button
        type="submit"
        className="w-full"
        disabled={stage === 'working'}
        data-testid="submit-button"
      >
        {stage === 'working' ? 'Working…' : 'Sign in'}
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
