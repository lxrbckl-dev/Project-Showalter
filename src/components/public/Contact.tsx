import { Mail, Phone } from 'lucide-react';

import type { SiteConfigRow } from '@/db/schema/site-config';

interface ContactProps {
  siteConfig: Pick<SiteConfigRow, 'phone' | 'email' | 'tiktokUrl' | 'emailTemplateSubject' | 'emailTemplateBody'>;
}

/**
 * Build a mailto URL with optional prefilled subject and body.
 * Uses URLSearchParams for encoding, then replaces '+' with '%20' because
 * mailto: requires percent-encoding (not application/x-www-form-urlencoded).
 */
function buildMailtoHref(
  email: string,
  subject: string | null | undefined,
  body: string | null | undefined,
): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString().replace(/\+/g, '%20');
  return `mailto:${email}${qs ? `?${qs}` : ''}`;
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-7 w-7">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.83a8.16 8.16 0 0 0 4.77 1.52V6.92a4.85 4.85 0 0 1-1.84-.23z" />
    </svg>
  );
}

/**
 * Contact section — icon buttons for phone, email, and TikTok.
 */
export function Contact({ siteConfig }: ContactProps) {
  const emailHref = siteConfig.email
    ? buildMailtoHref(siteConfig.email, siteConfig.emailTemplateSubject, siteConfig.emailTemplateBody)
    : null;

  return (
    <section id="contact" className="bg-white px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">Contact</h2>
        <div className="flex justify-center gap-6">
          {siteConfig.phone && (
            <a
              href={`tel:${siteConfig.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Call Sawyer"
              title="Call Sawyer"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-green-700 shadow-sm ring-1 ring-gray-200 transition-colors duration-200 hover:bg-green-100 hover:text-green-800"
            >
              <Phone className="h-7 w-7" aria-hidden="true" />
            </a>
          )}
          {emailHref && (
            <a
              href={emailHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Email Sawyer"
              title="Email Sawyer"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-green-700 shadow-sm ring-1 ring-gray-200 transition-colors duration-200 hover:bg-green-100 hover:text-green-800"
            >
              <Mail className="h-7 w-7" aria-hidden="true" />
            </a>
          )}
          {siteConfig.tiktokUrl && (
            <a
              href={siteConfig.tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sawyer on TikTok"
              title="Sawyer on TikTok"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-green-700 shadow-sm ring-1 ring-gray-200 transition-colors duration-200 hover:bg-green-100 hover:text-green-800"
            >
              <TikTokIcon />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
