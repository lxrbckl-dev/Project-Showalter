import type { SiteConfigRow } from '@/db/schema/site-config';
import { interpolateAge } from '@/lib/age';
import { HostFactsMarquee } from './HostFactsMarquee';

interface AboutProps {
  siteConfig: Pick<
    SiteConfigRow,
    'bio' | 'dateOfBirth' | 'timezone' | 'ownerFirstName' | 'hostFacts'
  >;
}

/**
 * About section — displays Sawyer's full bio from site_config.
 * Renders nothing if bio is null.
 *
 * The bio supports a single `[age]` placeholder (same bracket convention as
 * the message templates in `features/templates/render.ts`). At render time
 * it's replaced by the current integer age derived from `site_config.date_of_birth`
 * in the site timezone (see `src/lib/age.ts`).
 *
 * Above the heading, the host-facts marquee scrolls a randomized sequence of
 * short free-text facts (admin-managed in `site_config.host_facts`). It
 * occupies the slot where the static "Trusted Lawn Care" eyebrow used to
 * live and inherits the same visual treatment.
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
        <div className="mb-6">
          <HostFactsMarquee hostFacts={siteConfig.hostFacts} />
        </div>
        <h2 className="mb-4 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">About {siteConfig.ownerFirstName || 'Sawyer'}</h2>
        <p className="text-base leading-relaxed text-gray-700">{bio}</p>
      </div>
    </section>
  );
}
