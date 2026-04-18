import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sitePhotos, type SitePhotoRow } from '@/db/schema/site-photos';

/**
 * Returns all active photos ordered by sort_order, for the public gallery.
 */
export function getActivePhotos(): SitePhotoRow[] {
  const db = getDb();
  return db
    .select()
    .from(sitePhotos)
    .where(eq(sitePhotos.active, 1))
    .orderBy(asc(sitePhotos.sortOrder))
    .all();
}

/**
 * Returns all photos (active + archived) ordered by sort_order then id,
 * for the admin gallery page.
 */
export function getAllPhotos(): SitePhotoRow[] {
  const db = getDb();
  return db.select().from(sitePhotos).orderBy(asc(sitePhotos.sortOrder), asc(sitePhotos.id)).all();
}
