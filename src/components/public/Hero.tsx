import Image from 'next/image';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface HeroProps {
  siteConfig: Pick<SiteConfigRow, 'heroImagePath' | 'bio'>;
}

/**
 * Hero section — full-width banner with tagline, bio snippet, and primary CTA.
 *
 * If `heroImagePath` is set, renders it via Next.js Image. Otherwise falls
 * back to a clean white/off-white background with a 4px dark-green top accent
 * border — no stripe patterns.
 */
export function Hero({ siteConfig }: HeroProps) {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden bg-white px-6 py-20 text-center border-t-4 border-[#0F3D2E]">
      {/* Background: hero image only (no fallback pattern) */}
      {siteConfig.heroImagePath && (
        <Image
          src={siteConfig.heroImagePath}
          alt="Showalter Services — lawn care hero image"
          fill
          className="object-cover object-center opacity-60"
          priority
        />
      )}

      {/* Content overlay */}
      <div className="relative z-10 mx-auto max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#0F3D2E]">
          Showalter Services
        </p>
        <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-6xl">
          15-Year-Old Entrepreneur.
          <br />
          Trusted Lawn Care.
        </h1>

        {siteConfig.bio && (
          <p className="mb-8 text-lg leading-relaxed text-gray-600">{siteConfig.bio}</p>
        )}

        {!siteConfig.bio && (
          <p className="mb-8 text-lg leading-relaxed text-gray-600">
            Affordable, high quality services you can trust every time.
          </p>
        )}

        <a
          href="/book"
          className="inline-block rounded-md bg-[#0F3D2E] px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-[#1a5c44] focus:outline-none focus:ring-2 focus:ring-[#0F3D2E] focus:ring-offset-2 focus:ring-offset-white"
          data-umami-event="request_service_click"
        >
          Request service
        </a>
      </div>
    </section>
  );
}
