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
    theme_color: '#6C9630',
    // icons intentionally omitted — PWA icon assets are being regenerated.
    // Browsers fall back to favicon/apple-icon routes until new maskable
    // variants are added.
  };
}
