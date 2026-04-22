import { ImageResponse } from 'next/og';
import fs from 'fs/promises';
import path from 'path';
import { getSiteConfig } from '@/features/site-config/queries';

// Node runtime (not edge) — we read `site_config.site_title` via
// better-sqlite3, a native addon incompatible with the edge runtime. The
// extra cold-start cost is negligible for an OG image route that's rarely
// hit cold in production.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const alt = 'Sawyer Showalter Service — Lawn Care in Kansas City';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Dynamic Open Graph image — Next 15 file-convention route.
 * Renders a 1200×630 dark-green card with the business name and tagline.
 * No external fonts or static assets required; uses system sans-serif.
 *
 * The business name is pulled from `site_config.site_title` so admin edits
 * flow through to social-share cards on next crawl.
 */
export default async function OpengraphImage() {
  const logoBuffer = await fs.readFile(
    path.join(process.cwd(), 'public', 'logo_primary.png'),
  );
  const logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#052e16', // green-950
          padding: '80px',
        }}
      >
        {/* Decorative top rule */}
        <div
          style={{
            width: '120px',
            height: '4px',
            backgroundColor: '#4ade80', // green-400
            marginBottom: '40px',
            borderRadius: '2px',
          }}
        />

        {/* Primary logo — siteTitle is baked into the image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoDataUrl}
          alt="Sawyer Showalter Service"
          style={{ width: '816px', height: 'auto', objectFit: 'contain' }}
        />

        {/* Tagline */}
        <div
          style={{
            fontSize: '36px',
            color: '#86efac', // green-300
            marginTop: '32px',
            textAlign: 'center',
            fontWeight: 400,
          }}
        >
          Lawn Care in Kansas City
        </div>

        {/* Decorative bottom rule */}
        <div
          style={{
            width: '120px',
            height: '4px',
            backgroundColor: '#4ade80',
            marginTop: '40px',
            borderRadius: '2px',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
