import { StatsBand } from './StatsBand';

interface SitePhoto {
  id: number;
  path: string;
  caption: string | null;
  rating: number | null;
}

interface GalleryProps {
  photos: SitePhoto[];
  /**
   * Public site title — used as the alt-text fallback when a photo has no
   * caption. Pulled from `site_config.site_title` (admin-editable) so a
   * future rebrand updates the alt text too.
   */
  siteTitle: string;
}

/**
 * Reviews / photo gallery section — shows site_photos where active=1, ordered by sort_order.
 *
 * Renders a seamlessly looping horizontal marquee. Photos flow right-to-left
 * continuously; hovering pauses the animation. The photo list is duplicated
 * in the DOM so the loop is seamless — the second copy carries aria-hidden
 * so screen readers see each photo only once.
 *
 * Card sizing: fixed h-[332px] (332 px), width auto-sized to the photo's natural
 * aspect ratio. Portrait shots render as narrow tall cards; landscape as wider
 * cards. No cropping. Uses a plain <img> tag (not Next.js <Image>) because
 * Next's Image fill mode requires an explicit-width positioned parent — which
 * conflicts with content-driven widths for mixed orientations. The /uploads
 * route already serves with a 1-year immutable cache header, so browser
 * caching is fine without Next optimization.
 *
 * Renders nothing when photos array is empty.
 */
export function Gallery({ photos, siteTitle }: GalleryProps) {
  if (photos.length === 0) return null;

  const cards = photos.map((photo) => (
    <div
      key={photo.id}
      className="relative h-[332px] w-auto shrink-0 overflow-hidden rounded-lg"
      data-testid={`gallery-photo-${photo.id}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.path}
        alt={photo.caption ?? `${siteTitle} work photo`}
        className="h-full w-auto object-contain"
        loading="lazy"
      />
      {(photo.rating != null || photo.caption) && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-xs text-white">
          {photo.rating != null && (
            <div className="mb-0.5 text-yellow-400" aria-label={`${photo.rating} out of 5 stars`}>
              {'★'.repeat(photo.rating)}{'☆'.repeat(5 - photo.rating)}
            </div>
          )}
          {photo.caption && <p>{photo.caption}</p>}
        </div>
      )}
    </div>
  ));

  return (
    <section id="reviews" className="bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
          Reviews
        </h2>
      </div>

      {/* Aggregate stats — review-derived, sits between heading and photo marquee */}
      <div className="mb-8">
        <StatsBand />
      </div>

      {/* Marquee band — full bleed so photos extend past the padded heading */}
      <div className="overflow-hidden w-full">
        {/*
          Track contains photos TWICE so the loop is seamless:
            translateX(0)  → first copy fully visible
            translateX(-50%) → second copy is now in the same position as first copy started
          The second copy is aria-hidden so screen readers don't double-read.
        */}
        <div className="gallery-marquee-track flex gap-6">
          {/* First copy — visible to assistive technology */}
          {cards}

          {/* Second copy — visual only, hidden from screen readers */}
          <div aria-hidden="true" className="flex gap-6 shrink-0">
            {photos.map((photo) => (
              <div
                key={`dup-${photo.id}`}
                className="relative h-[332px] w-auto shrink-0 overflow-hidden rounded-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.path}
                  alt=""
                  className="h-full w-auto object-contain"
                  loading="lazy"
                />
                {(photo.rating != null || photo.caption) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-xs text-white">
                    {photo.rating != null && (
                      <div className="mb-0.5 text-yellow-400">
                        {'★'.repeat(photo.rating)}{'☆'.repeat(5 - photo.rating)}
                      </div>
                    )}
                    {photo.caption && <p>{photo.caption}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
