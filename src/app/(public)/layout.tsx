import Image from 'next/image';
import Link from 'next/link';
import { Footer } from '@/components/public/Footer';
import { UmamiScript } from '@/components/public/UmamiScript';

/**
 * Public-surface layout.
 *
 * The root `src/app/layout.tsx` owns the <html> shell, global styles, and
 * fonts. This layout adds:
 *   1. The Umami analytics script for public routes only (admin excluded).
 *   2. A site-wide header with the primary logo — appears above the Hero and
 *      on every public route (/book, /bookings/*, /review/*). The admin shell
 *      has its own header and is intentionally excluded from this layout.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // Sticky-footer pattern: outer flex column with `min-h-screen` and a
    // `flex-1` slot wrapping {children}. On short pages the slot stretches
    // to fill the remaining viewport so the Footer sits at the bottom of
    // the visible window; on long pages the slot grows past viewport and
    // the Footer flows naturally beneath the content.
    <div className="flex min-h-screen flex-col">
      <UmamiScript />
      <header className="flex items-center justify-center border-b border-gray-200 bg-gray-100 py-3">
        <Link href="/" aria-label="Go to homepage">
          <Image
            src="/logo_primary.png"
            alt="Showalter Lawn Care"
            width={1144}
            height={293}
            className="block h-20 w-auto"
            priority
          />
        </Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <Footer />
    </div>
  );
}
