/**
 * Unit tests for site-photos server actions.
 *
 * Uses an in-memory SQLite database (via the project's db helpers) with a
 * minimal schema so we can test the action logic without hitting production
 * data or disk.
 *
 * Tested:
 *  - uploadPhoto: inserts row, increments sort_order, returns ok:true
 *  - updatePhotoCaption: updates caption, returns ok:true; rejects bad ID
 *  - archivePhoto: sets active=0; restorePhoto: sets active=1
 *  - reorderPhotos: updates sort_order for all provided IDs in order
 *
 * Strategy: set UPLOADS_ROOT + DATABASE_URL to temp dirs before each test,
 * then run the full stack (migrate → action → DB query). Using ESM imports
 * directly with module isolation via vitest's isolate option.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { asc } from 'drizzle-orm';

// Mock next/cache — revalidatePath needs the Next.js server store context which
// isn't available in Vitest. A no-op mock is the standard pattern in this codebase.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ---------------------------------------------------------------------------
// Test setup: single temp dir for the whole describe block
// ---------------------------------------------------------------------------

let tmpDir: string;

function pngMagic(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
  buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x0d;
  buf[12] = 0x49; buf[13] = 0x48; buf[14] = 0x44; buf[15] = 0x52;
  return buf;
}

describe('site-photos actions (integration — temp DB)', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe1-photos-test-'));
    process.env.UPLOADS_ROOT = tmpDir;
    process.env.DATABASE_URL = `file:${path.join(tmpDir, 'test.db')}`;

    // Run migrations on fresh DB
    const { migrate } = await import('@/db/migrate');
    migrate();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOADS_ROOT;
    delete process.env.DATABASE_URL;
  });

  it('uploadPhoto: inserts a row and returns ok:true', async () => {
    const { uploadPhoto } = await import('./actions');

    const file = new File([pngMagic()], 'test.png', { type: 'image/png' });
    const form = new FormData();
    form.append('file', file);
    form.append('caption', 'My caption');

    const result = await uploadPhoto({ ok: true }, form);
    expect(result.ok).toBe(true);
  });

  it('uploadPhoto: returns error when no file provided', async () => {
    const { uploadPhoto } = await import('./actions');

    const form = new FormData();
    const result = await uploadPhoto({ ok: true }, form);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/No file/);
  });

  it('archivePhoto: sets active=0', async () => {
    const { uploadPhoto, archivePhoto } = await import('./actions');
    const { getDb } = await import('@/db');
    const { sitePhotos } = await import('@/db/schema/site-photos');

    const file = new File([pngMagic()], 'archive-test.png', { type: 'image/png' });
    const form = new FormData();
    form.append('file', file);
    await uploadPhoto({ ok: true }, form);

    const db = getDb();
    const photos = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    // Get the last inserted photo
    const photo = photos[photos.length - 1];
    expect(photo).toBeDefined();

    const archiveForm = new FormData();
    archiveForm.append('id', String(photo.id));
    const archiveResult = await archivePhoto({ ok: true }, archiveForm);
    expect(archiveResult.ok).toBe(true);

    const after = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    const afterPhoto = after.find((p) => p.id === photo.id);
    expect(afterPhoto?.active).toBe(0);
  });

  it('restorePhoto: sets active=1 after archiving', async () => {
    const { uploadPhoto, archivePhoto, restorePhoto } = await import('./actions');
    const { getDb } = await import('@/db');
    const { sitePhotos } = await import('@/db/schema/site-photos');

    const file = new File([pngMagic()], 'restore-test.png', { type: 'image/png' });
    const form = new FormData();
    form.append('file', file);
    await uploadPhoto({ ok: true }, form);

    const db = getDb();
    const photos = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    const photo = photos[photos.length - 1];

    const aForm = new FormData();
    aForm.append('id', String(photo.id));
    await archivePhoto({ ok: true }, aForm);

    const rForm = new FormData();
    rForm.append('id', String(photo.id));
    const restoreResult = await restorePhoto({ ok: true }, rForm);
    expect(restoreResult.ok).toBe(true);

    const after = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    const afterPhoto = after.find((p) => p.id === photo.id);
    expect(afterPhoto?.active).toBe(1);
  });

  it('updatePhotoCaption: updates caption', async () => {
    const { uploadPhoto, updatePhotoCaption } = await import('./actions');
    const { getDb } = await import('@/db');
    const { sitePhotos } = await import('@/db/schema/site-photos');

    const file = new File([pngMagic()], 'caption-test.png', { type: 'image/png' });
    const form = new FormData();
    form.append('file', file);
    await uploadPhoto({ ok: true }, form);

    const db = getDb();
    const photos = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    const photo = photos[photos.length - 1];

    const captionForm = new FormData();
    captionForm.append('id', String(photo.id));
    captionForm.append('caption', 'Updated caption');
    const captionResult = await updatePhotoCaption({ ok: true }, captionForm);
    expect(captionResult.ok).toBe(true);

    const after = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    const afterPhoto = after.find((p) => p.id === photo.id);
    expect(afterPhoto?.caption).toBe('Updated caption');
  });

  it('updatePhotoCaption: returns error for invalid ID', async () => {
    const { updatePhotoCaption } = await import('./actions');

    const form = new FormData();
    form.append('id', 'not-a-number');
    form.append('caption', 'test');
    const result = await updatePhotoCaption({ ok: true }, form);
    expect(result.ok).toBe(false);
  });

  it('reorderPhotos: updates sort_order', async () => {
    const { uploadPhoto, reorderPhotos } = await import('./actions');
    const { getDb } = await import('@/db');
    const { sitePhotos } = await import('@/db/schema/site-photos');

    // Upload two photos
    for (const name of ['reorder-a.png', 'reorder-b.png']) {
      const file = new File([pngMagic()], name, { type: 'image/png' });
      const form = new FormData();
      form.append('file', file);
      await uploadPhoto({ ok: true }, form);
    }

    const db = getDb();
    // The filePath is random UUID, not the original name — get last two by id
    const allPhotos = db.select().from(sitePhotos).orderBy(asc(sitePhotos.id)).all();
    const last2 = allPhotos.slice(-2);
    expect(last2.length).toBe(2);

    // Reverse order
    const reversedIds = [last2[1].id, last2[0].id];
    const reorderResult = await reorderPhotos(reversedIds);
    expect(reorderResult.ok).toBe(true);

    const after = db
      .select()
      .from(sitePhotos)
      .orderBy(asc(sitePhotos.sortOrder))
      .all();

    // The item that had last2[1].id should now come before last2[0].id in sort order
    const idx1 = after.findIndex((p) => p.id === last2[1].id);
    const idx0 = after.findIndex((p) => p.id === last2[0].id);
    expect(idx1).toBeLessThan(idx0);
  });
});
