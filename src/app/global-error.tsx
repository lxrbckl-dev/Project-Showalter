'use client';

import Link from 'next/link';

/**
 * Global error boundary — catches unhandled errors at the root layout level.
 *
 * In development the stack trace is shown to aid debugging.
 * In production only a friendly message is rendered — no internal detail leaked.
 *
 * Must be a Client Component (Next.js requirement for global-error).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-20 text-center">
          <div className="mx-auto max-w-md">
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[hsl(152,61%,15%)]">
              500
            </p>
            <h1 className="mb-4 text-3xl font-bold tracking-tight text-gray-900">
              Something went wrong
            </h1>
            <p className="mb-8 text-gray-600">
              An unexpected error occurred. Please try again, or head back to
              the home page.
            </p>

            {isDev && error?.message && (
              <details className="mb-8 rounded-md border border-red-200 bg-red-50 p-4 text-left text-xs text-red-700">
                <summary className="cursor-pointer font-semibold">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">
                  {error.message}
                  {error.stack ? `\n\n${error.stack}` : ''}
                </pre>
              </details>
            )}

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={reset}
                className="inline-block rounded-md bg-[hsl(152,61%,15%)] px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-[hsl(152,61%,22%)] focus:outline-none focus:ring-2 focus:ring-[hsl(152,61%,15%)] focus:ring-offset-2"
              >
                Try again
              </button>
              <Link
                href="/"
                className="inline-block rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[hsl(152,61%,15%)] focus:ring-offset-2"
              >
                &larr; Back to home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
