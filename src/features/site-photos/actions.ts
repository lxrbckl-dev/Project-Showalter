'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { sitePhotos } from '@/db/schema/site-photos';
import { upload } from '@/features/uploads/upload';

// ---------------------------------------------------------------------------
// Action result type
// ---------------------------------------------------------------------------

export type PhotoActionResult =
  | { ok: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// uploadPhoto
// ---------------------------------------------------------------------------

/**
 * Upload a gallery photo. Validates, strips EXIF, writes to disk, inserts a
 * site_photos row, and revalidates the public landing page.
 *
 * Called from the /admin/gallery upload form.
 */
export async function uploadPhoto(
  _prev: PhotoActionResult,
  data: FormData,
): Promise<PhotoActionResult> {
  const file = data.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file provided.' };
  }

  const caption = (data.get('caption') as string | null)?.trim() || null;

  let result: Awaited<ReturnType<typeof upload>>;
  try {
    result = await upload(file, { subdir: 'site/gallery', maxBytes: 1_073_741_824 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upload failed.' };
  }

  const db = getDb();

  // Determine next sort_order (append to end)
  const maxRow = db
    .select({ maxSort: sql<number>`COALESCE(MAX(sort_order), -1)` })
    .from(sitePhotos)
    .get();
  const nextSort = (maxRow?.maxSort ?? -1) + 1;

  db.insert(sitePhotos)
    .values({
      filePath: result.filePath,
      caption,
      sortOrder: nextSort,
      active: 1,
      createdAt: new Date().toISOString(),
    })
    .run();

  revalidatePath('/');
  revalidatePath('/admin/gallery');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// updatePhotoCaption
// ---------------------------------------------------------------------------

/**
 * Update the caption of an existing photo.
 */
export async function updatePhotoCaption(
  _prev: PhotoActionResult,
  data: FormData,
): Promise<PhotoActionResult> {
  const id = Number(data.get('id'));
  const caption = (data.get('caption') as string | null)?.trim() || null;

  if (!id || isNaN(id)) {
    return { ok: false, error: 'Invalid photo ID.' };
  }

  const db = getDb();
  db.update(sitePhotos).set({ caption }).where(eq(sitePhotos.id, id)).run();

  revalidatePath('/');
  revalidatePath('/admin/gallery');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// reorderPhotos
// ---------------------------------------------------------------------------

/**
 * Persist a new display order for gallery photos.
 *
 * @param orderedIds — photo IDs in the desired display order.
 *   Called from the /admin/gallery drag-and-drop handler.
 */
export async function reorderPhotos(orderedIds: number[]): Promise<PhotoActionResult> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'No IDs provided.' };
  }

  const db = getDb();

  // Run all sort_order updates in a single transaction for atomicity.
  db.transaction((txDb) => {
    orderedIds.forEach((id, index) => {
      txDb.update(sitePhotos).set({ sortOrder: index }).where(eq(sitePhotos.id, id)).run();
    });
  });

  revalidatePath('/');
  revalidatePath('/admin/gallery');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// archivePhoto / restorePhoto
// ---------------------------------------------------------------------------

/**
 * Soft-archive a gallery photo (sets active=0). The file stays on disk.
 * No hard deletions per project convention.
 */
export async function archivePhoto(
  _prev: PhotoActionResult,
  data: FormData,
): Promise<PhotoActionResult> {
  const id = Number(data.get('id'));
  if (!id || isNaN(id)) return { ok: false, error: 'Invalid photo ID.' };

  const db = getDb();
  db.update(sitePhotos).set({ active: 0 }).where(eq(sitePhotos.id, id)).run();

  revalidatePath('/');
  revalidatePath('/admin/gallery');
  return { ok: true };
}

/**
 * Restore an archived photo (sets active=1).
 */
export async function restorePhoto(
  _prev: PhotoActionResult,
  data: FormData,
): Promise<PhotoActionResult> {
  const id = Number(data.get('id'));
  if (!id || isNaN(id)) return { ok: false, error: 'Invalid photo ID.' };

  const db = getDb();
  db.update(sitePhotos).set({ active: 1 }).where(eq(sitePhotos.id, id)).run();

  revalidatePath('/');
  revalidatePath('/admin/gallery');
  return { ok: true };
}
