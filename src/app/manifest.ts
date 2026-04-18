import type { MetadataRoute } from 'next';
import { getSiteConfig } from '@/features/site-config/queries';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Pull the admin-configurable business name from site_config so the
  // installed-PWA home-screen label tracks a rebrand. The short_name stays
  // literally "Showalter" — it's the icon label and needs to stay short
  // enough not to truncate on small screens regardless of the full title.
  const config = await getSiteConfig();
  const name = config?.siteTitle ?? 'Sawyer Showalter Service';

  return {
    name,
    short_name: 'Showalter',
    description: 'Lawn care booking',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#0F3D2E',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
