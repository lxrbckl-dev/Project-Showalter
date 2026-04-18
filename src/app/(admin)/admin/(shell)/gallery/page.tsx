/**
 * /admin/gallery — Gallery management page (Phase 3C).
 *
 * Server component. Fetches all site_photos rows and renders:
 *   - Upload form
 *   - Active photos grid (with caption editor, archive button)
 *   - Drag-to-reorder section (active photos only)
 *   - Archived photos section
 */

import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth';
import { getAllPhotos } from '@/features/site-photos/queries';
import { GalleryUploadForm } from '@/components/admin/gallery/GalleryUploadForm';
import { GalleryPhotoCard } from '@/components/admin/gallery/GalleryPhotoCard';
import { SortableGalleryList } from '@/components/admin/gallery/SortableGalleryList';

export const metadata = { title: 'Gallery — Showalter Admin' };

export default async function AdminGalleryPage() {
  const session = await auth();
  if (!session) redirect('/admin/login');

  const photos = getAllPhotos();
  const active = photos.filter((p) => p.active === 1);
  const archived = photos.filter((p) => p.active === 0);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Manage the photos shown on the public site gallery. Drag to reorder active photos.
        </p>
      </section>

      {/* Upload form */}
      <section>
        <GalleryUploadForm />
      </section>

      {/* Active photos grid */}
      <section>
        <h2 className="mb-4 text-lg font-medium">
          Active photos
          <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">
            ({active.length})
          </span>
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]" data-testid="gallery-empty">
            No active photos. Upload one above.
          </p>
        ) : (
          <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
            data-testid="gallery-active-grid"
          >
            {active.map((photo) => (
              <GalleryPhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        )}
      </section>

      {/* Drag-to-reorder */}
      <section>
        <h2 className="mb-1 text-lg font-medium">Reorder</h2>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          Drag photos to change their display order on the public site.
        </p>
        <SortableGalleryList photos={photos} />
      </section>

      {/* Archived photos */}
      {archived.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium">
            Archived
            <span className="ml-2 text-sm font-normal text-[hsl(var(--muted-foreground))]">
              ({archived.length})
            </span>
          </h2>
          <div
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
            data-testid="gallery-archived-grid"
          >
            {archived.map((photo) => (
              <GalleryPhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
