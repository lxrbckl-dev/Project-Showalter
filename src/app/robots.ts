import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/env';

const BASE_URL = getBaseUrl();

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
