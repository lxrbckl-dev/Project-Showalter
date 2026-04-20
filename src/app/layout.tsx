import type { Metadata, Viewport } from 'next';
import { getSiteConfig } from '@/features/site-config/queries';
import './globals.css';

const BASE_URL = process.env.BASE_URL ?? 'https://showalter.business';

// Tagline is still hardcoded (not part of the admin-editable brand); the
// leading business name comes from `site_config.site_title`.
const TAGLINE = 'Lawn Care in Kansas City';
const SITE_DESCRIPTION_FALLBACK =
  'Affordable lawn care, trash can cleaning, and snow removal in Kansas City. Run by a local teen entrepreneur.';

export const viewport: Viewport = {
  themeColor: '#6C9630',
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const siteTitle = config?.siteTitle ?? 'Sawyer Showalter Service';
  const fullTitle = `${siteTitle} — ${TAGLINE}`;
  // Description lead-in uses the stored (mixed-case) title so it reads
  // naturally in search-result snippets and social previews.
  const description = `${siteTitle} offers ${SITE_DESCRIPTION_FALLBACK}`;

  return {
    metadataBase: new URL(BASE_URL),
    title: {
      default: fullTitle,
      template: `%s | ${siteTitle}`,
    },
    description,
    openGraph: {
      type: 'website',
      url: BASE_URL,
      siteName: siteTitle,
      title: fullTitle,
      description,
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: ['/opengraph-image'],
    },
    alternates: {
      canonical: BASE_URL,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
