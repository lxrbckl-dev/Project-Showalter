/**
 * /admin/login — passkey enrollment + authentication entry point.
 *
 * Renders a fully client-side form because the WebAuthn ceremony requires
 * access to `navigator.credentials`. The page itself is a server component
 * that imports the client form; this keeps the server bundle small and lets
 * the login path render without touching the DB on GET.
 */

import { LoginForm } from './LoginForm';

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
      <div className="w-full">
        <h1 className="text-2xl font-semibold tracking-tight">Admin sign-in</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Passkey-powered. Use the device you enrolled with.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
