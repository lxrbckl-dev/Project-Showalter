import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

const BASE_URL = process.env.BASE_URL ?? 'https://showalter.business';

const SITE_TITLE = 'Showalter Services — Lawn Care in Kansas City';
const SITE_DESCRIPTION =
  'Showalter Services offers affordable lawn care, trash can cleaning, and snow removal in Kansas City. Run by a local teen entrepreneur.';

export const viewport: Viewport = {
  themeColor: '#0F3D2E',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s | Showalter Services',
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: 'Showalter Services',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Showalter Services — Lawn Care in Kansas City',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Service worker stub — registration only. Push logic lands in Phase 8. */}
        {process.env.NODE_ENV === 'production' && (
          <Script id="sw-register" strategy="afterInteractive">{`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker
                  .register('/sw.js')
                  .catch(function (err) { console.error('[sw] registration failed', err); });
              });
            }
          `}</Script>
        )}
      </body>
    </html>
  );
}
