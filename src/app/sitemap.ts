import type { MetadataRoute } from 'next';

const BASE_URL = process.env.BASE_URL ?? 'https://showalter.business';

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
