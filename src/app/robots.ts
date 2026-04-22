import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Next 15 file-convention robots.txt route.
 * Allows all crawlers and references the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const BASE_URL = getBaseUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
