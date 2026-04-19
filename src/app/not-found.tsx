import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Not Found',
};

/**
 * Global 404 — rendered by Next.js for any route that has no matching page.
 * Simple, on-brand, links back to home. No detail that could aid enumeration.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-20 text-center">
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
        <div className="mt-10 flex justify-center">
          <Image
            src="/logo_secondary.png"
            alt=""
            width={130}
            height={130}
            className="h-auto w-auto max-w-[130px] opacity-60"
          />
        </div>
      </div>
    </main>
  );
}
