'use client';

/**
 * UmamiScript — injects the Umami analytics tracking script.
 *
 * Renders only when both NEXT_PUBLIC_UMAMI_SRC and
 * NEXT_PUBLIC_UMAMI_WEBSITE_ID are set. If either is missing (e.g. in dev
 * or before Umami is configured), the component renders nothing — the site
 * functions normally without analytics.
 *
 * Placed in the public layout so it tracks public routes only. Admin routes
 * are intentionally excluded.
 */

const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export function UmamiScript() {
  if (!src || !websiteId) return null;

  return (
    <script
      defer
      src={src}
      data-website-id={websiteId}
    />
  );
}
