import type { SiteConfigRow } from '@/db/schema/site-config';
import { formatUSPhone } from '@/lib/formatters/phone';

interface ContactProps {
  siteConfig: Pick<SiteConfigRow, 'phone' | 'email' | 'tiktokUrl'>;
}

/**
 * Contact section — plain-text phone, email mailto link, TikTok external link.
 */
export function Contact({ siteConfig }: ContactProps) {
  return (
    <section id="contact" className="bg-neutral-50 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">Contact</h2>
        <ul className="space-y-3 text-base text-gray-700">
          {siteConfig.phone && (
            <li>
              <span className="font-medium text-gray-900">Phone:</span>{' '}
              <a
                href={`tel:${siteConfig.phone}`}
                className="text-green-700 underline hover:text-green-600"
              >
                {formatUSPhone(siteConfig.phone)}
              </a>
            </li>
          )}
          {siteConfig.email && (
            <li>
              <span className="font-medium text-gray-900">Email:</span>{' '}
              <a
                href={`mailto:${siteConfig.email}`}
                className="text-green-700 underline hover:text-green-600"
              >
                {siteConfig.email}
              </a>
            </li>
          )}
          {siteConfig.tiktokUrl && (
            <li>
              <span className="font-medium text-gray-900">TikTok:</span>{' '}
              <a
                href={siteConfig.tiktokUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 underline hover:text-green-600"
              >
                @showalterservices
              </a>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
