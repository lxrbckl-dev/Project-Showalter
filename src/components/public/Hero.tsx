import Image from 'next/image';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface HeroProps {
  siteConfig: Pick<SiteConfigRow, 'heroImagePath' | 'siteTitle'>;
}

/**
 * Hero section — full-width background image banner.
 *
 * If `heroImagePath` is unset, renders nothing (returns null) — the About
 * section becomes the first visible section after the header.
 * Headline and CTA have moved: tagline lives in About, booking CTA lives in
 * the #request section on the landing page.
 */
export function Hero({ siteConfig }: HeroProps) {
  if (!siteConfig.heroImagePath) return null;

  return (
    <section className="relative min-h-[50vh] overflow-hidden bg-white">
      <Image
        src={siteConfig.heroImagePath}
        alt={`${siteConfig.siteTitle} — lawn care hero image`}
        fill
        className="object-cover object-center opacity-60"
        priority
      />
    </section>
  );
}
