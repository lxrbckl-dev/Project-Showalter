/**
 * `/admin/signup?token=<t>` — invite-link acceptance entry point.
 *
 * Server component. Looks up the invite via `lookupInviteForSignup`:
 *
 *   - Invalid / missing / expired / used / revoked → renders the canonical
 *     "couldn't sign in" failure panel. Never leaks which specific reason.
 *
 *   - Valid → renders `InviteSignupForm` with `invitedEmail` pre-filled and
 *     marked read-only in the client. The signup flow itself runs the
 *     WebAuthn ceremony via server actions in `features/auth/invites.ts`.
 */

import Link from 'next/link';
import { lookupInviteForSignup } from '@/features/auth/invites';
import { AUTH_GENERIC_FAILURE_MESSAGE } from '@/features/auth/response';
import { InviteSignupForm } from './InviteSignupForm';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ token?: string | string[] }>;
};

function pickToken(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export default async function AdminSignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = pickToken(params.token);

  if (!token) {
    return <InvalidInvitePanel />;
  }

  const lookup = await lookupInviteForSignup(token);
  if (!lookup.ok) {
    return <InvalidInvitePanel />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight">Accept admin invite</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          You&rsquo;ve been invited to join the Showalter admin. Enroll a
          passkey on this device to finish.
          {lookup.label ? (
            <span className="ml-1 italic">({lookup.label})</span>
          ) : null}
        </p>
        <div className="mt-8">
          <InviteSignupForm
            token={token}
            invitedEmail={lookup.invitedEmail}
            expiresAt={lookup.expiresAt}
          />
        </div>
      </div>
    </main>
  );
}

function InvalidInvitePanel() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16"
      data-testid="invite-invalid-panel"
    >
      <div className="w-full space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Couldn&rsquo;t sign in
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {AUTH_GENERIC_FAILURE_MESSAGE}. If you were expecting an invite, ask
          the admin who sent it to issue a fresh one.
        </p>
        <Link
          href="/admin/login"
          className="text-sm underline"
          data-testid="invite-login-link"
        >
          Go to sign-in
        </Link>
      </div>
    </main>
  );
}
