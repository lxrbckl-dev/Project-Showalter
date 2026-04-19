import type { SiteConfigRow } from '@/db/schema/site-config';
import { interpolateAge } from '@/lib/age';

interface AboutProps {
  siteConfig: Pick<SiteConfigRow, 'bio' | 'dateOfBirth' | 'timezone' | 'ownerFirstName'>;
}

/**
 * About section — displays Sawyer's full bio from site_config.
 * Renders nothing if bio is null.
 *
 * The bio supports a single `[age]` placeholder (same bracket convention as
 * the message templates in `features/templates/render.ts`). At render time
 * it's replaced by the current integer age derived from `site_config.date_of_birth`
 * in the site timezone (see `src/lib/age.ts`). When DOB is unset, the
 * placeholder is stripped and surrounding whitespace is tidied — Alex can
 * choose to rephrase, or set a DOB, whichever he prefers.
 *
 * "Trusted Lawn Care." tagline is rendered as an eyebrow above the heading.
 * It was previously in the Hero h1; it now lives here so it appears even when
 * there is no hero background image.
 */
export function About({ siteConfig }: AboutProps) {
  if (!siteConfig.bio) return null;

  const bio = interpolateAge(siteConfig.bio, siteConfig.dateOfBirth, {
    timezone: siteConfig.timezone,
  });

  if (!bio) return null;

  return (
    <section id="about" className="bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-green-800">Trusted Lawn Care</p>
        <h2 className="mb-4 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">About {siteConfig.ownerFirstName || 'Sawyer'}</h2>
        <p className="text-base leading-relaxed text-gray-700">{bio}</p>
      </div>
    </section>
  );
}
