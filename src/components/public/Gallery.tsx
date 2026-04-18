import Image from 'next/image';

interface SitePhoto {
  id: number;
  path: string;
  caption: string | null;
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
 * Photo gallery section — shows site_photos where active=1, ordered by sort_order.
 *
 * Renders nothing when photos array is empty (handles both the case where the
 * table doesn't exist yet — Phase 3 — and the case where no photos are uploaded).
 */
export function Gallery({ photos, siteTitle }: GalleryProps) {
  if (photos.length === 0) return null;

  return (
    <section id="gallery" className="bg-gray-50 px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-8 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">Photo Gallery</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-lg"
              data-testid={`gallery-photo-${photo.id}`}
            >
              <Image
                src={photo.path}
                alt={photo.caption ?? `${siteTitle} work photo`}
                fill
                className="object-cover object-center"
              />
              {photo.caption && (
                <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-xs text-white">
                  {photo.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
