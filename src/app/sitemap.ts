import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Next 15 file-convention sitemap.xml route.
 * Includes public routes. More routes will be added as Phases land.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const BASE_URL = getBaseUrl();
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
