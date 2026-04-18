import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F3D2E',
          borderRadius: '4px',
        }}
      >
        <span
          style={{
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '-0.5px',
          }}
        >
          SS
        </span>
      </div>
    ),
    { ...size },
  );
}
