/**
 * Upload delete helper — Phase 3C.
 *
 * Removes a file from /data/uploads/<relativePath>.
 *
 * IMPORTANT: Per project conventions (STACK.md / CLAUDE.md), no hard deletions
 * are ever performed by agents or by automatic cleanup that isn't explicitly
 * scheduled. This helper exists solely for two legitimate use cases:
 *
 *   1. Nightly retention cleanup (Phase 8) — purges booking_attachments files
 *      for bookings that reached a terminal state > photo_retention_days_after_resolve ago.
 *   2. Admin removes an archived site_photo (active=0) — currently the admin
 *      sets active=0 (soft-archive) via archivePhoto(); if we want to reclaim
 *      disk, a future admin action can call deleteFile() after confirming.
 *
 * For Phase 3C only `deleteFile` is exported. Callers are responsible for
 * also removing / updating the corresponding DB row.
 */

import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

function uploadsRoot(): string {
  return process.env.UPLOADS_ROOT ?? '/data/uploads';
}

/**
 * Delete a file from the uploads directory.
 *
 * @param relativePath — path relative to /data/uploads (value stored in DB).
 *   Example: 'site/gallery/abc123.jpg'
 *
 * Silently succeeds if the file does not exist (idempotent).
 * Throws if the path escapes the uploads root (path traversal guard).
 */
export function deleteFile(relativePath: string): void {
  if (relativePath.includes('..')) {
    throw new Error('deleteFile: path traversal detected');
  }

  const root = uploadsRoot();
  const absPath = resolve(join(root, relativePath));
  if (!absPath.startsWith(resolve(root) + '/') && absPath !== resolve(root)) {
    throw new Error('deleteFile: path escapes uploads root');
  }

  if (existsSync(absPath)) {
    rmSync(absPath, { force: true });
  }
}
