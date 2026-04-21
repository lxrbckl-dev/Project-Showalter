import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Not Found',
};

/**
 * Route-level 404 for /bookings/[token].
 *
 * Deliberately vague — must be indistinguishable from any other 404 to
 * prevent token enumeration. Never mention "booking", "token", or anything
 * that would let an attacker confirm whether a token exists.
 */
export default function BookingNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-20 text-center">
      <div className="mx-auto max-w-md">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[hsl(152,61%,15%)]">
          404
        </p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-gray-900">
          This page doesn&apos;t exist
        </h1>
        <p className="mb-8 text-gray-600">
          We couldn&apos;t find what you were looking for. Head back to the
          home page and try again.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-[hsl(152,61%,15%)] px-6 py-3 text-sm font-semibold text-white shadow transition hover:bg-[hsl(152,61%,22%)] focus:outline-none focus:ring-2 focus:ring-[hsl(152,61%,15%)] focus:ring-offset-2"
        >
          &larr; Back to home
        </Link>
      </div>
    </main>
  );
}
