import type { SiteConfigRow } from '@/db/schema/site-config';

interface AboutProps {
  siteConfig: Pick<SiteConfigRow, 'bio'>;
}

/**
 * About section — displays Sawyer's full bio from site_config.
 * Renders nothing if bio is null.
 */
export function About({ siteConfig }: AboutProps) {
  if (!siteConfig.bio) return null;

  return (
    <section id="about" className="bg-neutral-50 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">About Sawyer</h2>
        <p className="text-base leading-relaxed text-gray-700">{siteConfig.bio}</p>
      </div>
    </section>
  );
}
