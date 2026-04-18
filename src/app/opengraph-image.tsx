import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Showalter Services — Lawn Care in Kansas City';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Dynamic Open Graph image — Next 15 file-convention route.
 * Renders a 1200×630 dark-green card with the business name and tagline.
 * No external fonts or static assets required; uses system sans-serif.
 */
export default function OpengraphImage() {
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

        {/* Business name */}
        <div
          style={{
            fontSize: '80px',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.1,
            letterSpacing: '-1px',
          }}
        >
          Showalter Services
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '36px',
            color: '#86efac', // green-300
            marginTop: '24px',
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
