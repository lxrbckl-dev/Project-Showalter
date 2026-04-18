import type { SiteConfigRow } from '@/db/schema/site-config';

interface FooterProps {
  siteConfig: Pick<SiteConfigRow, 'phone' | 'smsTemplate'>;
}

/**
 * Footer — buried "Have a question? Text Sawyer directly →" SMS link.
 *
 * The `sms:` URI uses the stored sms_template as the pre-filled message body.
 */
export function Footer({ siteConfig }: FooterProps) {
  const phone = siteConfig.phone ?? '';
  const smsBody = siteConfig.smsTemplate ?? '';
  const smsHref = phone
    ? `sms:${phone}${smsBody ? `?body=${encodeURIComponent(smsBody)}` : ''}`
    : undefined;

  return (
    <footer className="border-t border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
      {smsHref && (
        <p className="mb-3">
          <a
            href={smsHref}
            className="text-green-700 underline hover:text-green-600"
            data-umami-event="text_sawyer_click"
          >
            Have a question? Text Sawyer directly →
          </a>
        </p>
      )}
      <p>
        &copy; {new Date().getFullYear()} Showalter Services. All rights reserved.
      </p>
    </footer>
  );
}
