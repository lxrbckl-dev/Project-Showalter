import Image from 'next/image';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface HeroProps {
  siteConfig: Pick<SiteConfigRow, 'heroImagePath' | 'bio'>;
}

/**
 * Hero section — full-width banner with tagline, bio snippet, and primary CTA.
 *
 * If `heroImagePath` is set, renders it via Next.js Image. Otherwise falls
 * back to a CSS-gradient placeholder in Sawyer's brand colors (dark green on
 * black with a subtle diagonal lawn-stripe hint).
 */
export function Hero({ siteConfig }: HeroProps) {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden bg-black px-6 py-20 text-center text-white">
      {/* Background: hero image or gradient placeholder */}
      {siteConfig.heroImagePath ? (
        <Image
          src={siteConfig.heroImagePath}
          alt="Showalter Services — lawn care hero image"
          fill
          className="object-cover object-center opacity-60"
          priority
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(135deg, #0a2e0a 0px, #0a2e0a 24px, #051505 24px, #051505 48px)',
          }}
        />
      )}

      {/* Content overlay */}
      <div className="relative z-10 mx-auto max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green-400">
          Showalter Services
        </p>
        <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          15-Year-Old Entrepreneur.
          <br />
          Trusted Lawn Care.
        </h1>

        {siteConfig.bio && (
          <p className="mb-8 text-lg leading-relaxed text-gray-200">{siteConfig.bio}</p>
        )}

        {!siteConfig.bio && (
          <p className="mb-8 text-lg leading-relaxed text-gray-300">
            Affordable, high quality services you can trust every time.
          </p>
        )}

        <a
          href="/book"
          className="inline-block rounded-md bg-green-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-black"
          data-umami-event="request_service_click"
        >
          Request service
        </a>
      </div>
    </section>
  );
}
