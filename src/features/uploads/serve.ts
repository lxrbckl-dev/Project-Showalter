/**
 * Upload serving helper — Phase 3C.
 *
 * Reads a file from /data/uploads/<relativePath> and returns a Response with
 * the correct Content-Type. Used by the Next.js route handler at
 * `src/app/uploads/[...path]/route.ts`.
 *
 * Security:
 *  - Path traversal guard: rejects any path that contains '..' after normalisation.
 *    The caller should pass the raw path segments from the URL and this function
 *    will validate them before touching the filesystem.
 *  - Only files whose MIME type (magic bytes) matches ACCEPTED_MIMES are served;
 *    everything else gets 404 so the uploads directory can't be used to exfiltrate
 *    non-image files even if one were somehow written there.
 *
 * Returns:
 *  - A Response with the file contents and correct Content-Type on success.
 *  - A 404 Response for missing/traversal/unsupported files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sniffMime, ACCEPTED_MIMES } from './upload';

function uploadsRoot(): string {
  return process.env.UPLOADS_ROOT ?? '/data/uploads';
}

/**
 * Serve a file from the uploads directory.
 *
 * @param pathSegments — URL path segments after `/uploads/` (already split on `/`).
 *   Example: ['site', 'gallery', 'abc123.jpg']
 */
export function serveUpload(pathSegments: string[]): Response {
  // 1. Reassemble and normalise
  const joined = pathSegments.join('/');

  // 2. Path traversal guard — reject any segment or joined path containing '..'
  if (pathSegments.some((s) => s === '..' || s.includes('/')) || joined.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const root = uploadsRoot();
  const absPath = resolve(join(root, joined));
  // Double-check resolved path is still inside UPLOADS_ROOT
  if (!absPath.startsWith(resolve(root) + '/') && absPath !== resolve(root)) {
    return new Response('Not found', { status: 404 });
  }

  // 3. Existence check
  if (!existsSync(absPath)) {
    return new Response('Not found', { status: 404 });
  }

  // 4. Read file and sniff MIME from magic bytes
  let data: Buffer;
  try {
    data = readFileSync(absPath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const mimeType = sniffMime(new Uint8Array(data.buffer, data.byteOffset, Math.min(data.length, 16)));
  if (!mimeType || !ACCEPTED_MIMES.has(mimeType)) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(data.length),
    },
  });
}
