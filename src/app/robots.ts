import type { MetadataRoute } from 'next';

const BASE_URL = process.env.BASE_URL ?? 'https://showalter.business';

/**
 * Next 15 file-convention robots.txt route.
 * Allows all crawlers and references the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
