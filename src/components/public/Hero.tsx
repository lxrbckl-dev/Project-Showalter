import Image from 'next/image';
import type { SiteConfigRow } from '@/db/schema/site-config';
import { interpolateAge } from '@/lib/age';

interface HeroProps {
  siteConfig: Pick<
    SiteConfigRow,
    'heroImagePath' | 'bio' | 'dateOfBirth' | 'timezone' | 'siteTitle'
  >;
}

/**
 * Hero section — full-width banner with tagline, bio snippet, and primary CTA.
 *
 * If `heroImagePath` is set, renders it via Next.js Image. Otherwise falls
 * back to a clean white/off-white background with a 4px dark-green top accent
 * border — no stripe patterns.
 */
export function Hero({ siteConfig }: HeroProps) {
  // Interpolate [age] in the bio against site_config.date_of_birth. Falls back
  // to stripping the placeholder if DOB is unset (see src/lib/age.ts).
  const bio = interpolateAge(siteConfig.bio, siteConfig.dateOfBirth, {
    timezone: siteConfig.timezone,
  });

  // Headline age — falls back to "Lawn Care" tagline alone if DOB is unset
  // (we avoid hardcoding "15" here now that the bio is DOB-driven).
  const age = siteConfig.dateOfBirth
    ? interpolateAge('[age]', siteConfig.dateOfBirth, { timezone: siteConfig.timezone })
    : null;

  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden bg-white px-6 py-20 text-center">
      {/* Background: hero image only (no fallback pattern) */}
      {siteConfig.heroImagePath && (
        <Image
          src={siteConfig.heroImagePath}
          alt={`${siteConfig.siteTitle} — lawn care hero image`}
          fill
          className="object-cover object-center opacity-60"
          priority
        />
      )}

      {/* Content overlay */}
      <div className="relative z-10 mx-auto max-w-2xl">
        <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-gray-900 md:text-6xl">
          {age ? (
            <>
              {age}-Year-Old Entrepreneur.
              <br />
              Trusted Lawn Care.
            </>
          ) : (
            <>Trusted Lawn Care.</>
          )}
        </h1>

        {bio && <p className="mb-8 text-lg leading-relaxed text-gray-600">{bio}</p>}

        {!bio && (
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
