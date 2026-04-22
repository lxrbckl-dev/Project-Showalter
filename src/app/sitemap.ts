import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/env';

const BASE_URL = getBaseUrl();

/**
 * Next 15 file-convention sitemap.xml route.
 * Includes public routes. More routes will be added as Phases land.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
