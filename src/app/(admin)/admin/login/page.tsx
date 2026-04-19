/**
 * /admin/login — passkey login + founding-admin entry point.
 *
 * Server component. Renders one of two forms based on a tiny read-only check
 * of the `admins` table:
 *
 *   - Empty table → `FoundingAdminForm`. The first visitor claims the
 *     founding admin slot. The authoritative race-protection lives inside
 *     the `finishFoundingEnrollment` server action, which re-checks the
 *     table inside a transaction — we don't trust this page render.
 *
 *   - Non-empty → `LoginForm` (standard passkey login).
 *
 * WebAuthn ceremonies require `navigator.credentials`, so both variants are
 * client components. This page only picks which one to render.
 */

import Image from 'next/image';
import { isAdminsTableEmpty } from '@/features/auth/found';
import { LoginForm } from './LoginForm';
import { FoundingAdminForm } from './FoundingAdminForm';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const empty = await isAdminsTableEmpty();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo_primary.png"
            alt="Sawyer Showalter Service"
            width={336}
            height={336}
            className="h-auto w-auto max-w-[336px]"
            priority
          />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {empty ? 'Create the first admin' : 'Admin sign-in'}
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {empty
            ? 'No admin exists yet on this deploy. Claim the founding admin slot by enrolling a passkey below.'
            : 'Passkey-powered. Use the device you enrolled with.'}
        </p>
        <div className="mt-8">
          {empty ? <FoundingAdminForm /> : <LoginForm />}
        </div>
      </div>
    </main>
  );
}
