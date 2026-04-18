import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Showalter Services',
  description: 'Showalter Services — yard care, trash cans, snow, and more.',
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
