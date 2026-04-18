/**
 * Upload file serving route — Phase 3C.
 *
 * GET /uploads/<subdir>/<filename>
 *
 * Serves files from /data/uploads with path traversal protection and
 * magic-byte MIME validation. Only accepted image types are served.
 *
 * Security model:
 *  - Segments containing '..' are rejected (404).
 *  - Resolved absolute path must remain inside /data/uploads.
 *  - File bytes are sniffed for a known image magic signature; non-image
 *    files return 404 even if they exist on disk.
 */

import { serveUpload } from '@/features/uploads/serve';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  return serveUpload(path ?? []);
}
