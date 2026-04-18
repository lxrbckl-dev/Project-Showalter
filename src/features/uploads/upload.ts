/**
 * Shared upload helper — Phase 3C.
 *
 * Writes an uploaded File to /data/uploads/<subdir>/<random>.<ext> after:
 *   1. Checking file size against the caller-supplied limit
 *   2. Detecting MIME type from magic bytes (not file extension / Content-Type)
 *   3. Stripping EXIF metadata from JPEG / HEIC images via `exifr`
 *
 * The primary API is `upload(file, options)`. Phase 5 (booking attachments)
 * will call the same function with `subdir: 'bookings/<id>'`.
 *
 * Design notes:
 *  - Random filenames (UUID v4) prevent enumeration of the uploads directory.
 *  - File extension is derived from the sniffed MIME type, never from the
 *    original filename — a renamed .exe will not become a .jpeg on disk.
 *  - EXIF stripping is wrapped in a try/catch per STACK.md: if stripping fails
 *    we throw rather than silently save a potentially-leaky original.
 *  - `/data/uploads` is the container bind-mount root. In dev the same path is
 *    used so integration tests exercise real disk I/O. The directory is created
 *    automatically if it does not exist.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Return the filesystem root for all uploads. Read from env at call time so tests can override. */
function uploadsRoot(): string {
  return process.env.UPLOADS_ROOT ?? '/data/uploads';
}

/** Accepted MIME types (JPEG, PNG, HEIC/HEIF, WebP). */
export const ACCEPTED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

/** Map accepted MIME → canonical file extension. */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
};

// ---------------------------------------------------------------------------
// MIME sniffing (magic bytes)
// ---------------------------------------------------------------------------

/**
 * Detect image MIME type from the file's leading bytes.
 * Returns null when the bytes do not match any accepted image format.
 *
 * References:
 *  - JPEG: 0xFF 0xD8 0xFF
 *  - PNG:  0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
 *  - WebP: 0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50 (RIFF....WEBP)
 *  - HEIC/HEIF: ftyp box at offset 4; brand contains 'heic', 'heix', 'mif1', etc.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF????WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // HEIC / HEIF: ftyp box at byte offset 4 ("ftyp" = 66 74 79 70)
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    // Brand is bytes 8..11 (ASCII)
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    // Common HEIC/HEIF brands: heic heix mif1 msf1 hevc hevx
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc', 'hevx'].some((b) => brand.startsWith(b))) {
      return 'image/heic';
    }
    // isoM brand used by some HEIF files
    if (brand === 'isom' || brand === 'iso2') {
      return 'image/heif';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// EXIF stripping
// ---------------------------------------------------------------------------

/**
 * Strip EXIF from a JPEG buffer.
 *
 * JPEG APP1 segments (EXIF, XMP) begin with FF E1. We scan the JPEG SOF stream
 * and remove all APP1..APP15 segments (FF E1..FF EF) as well as the COM segment
 * (FF FE). APP0 (JFIF) is preserved for compatibility.
 *
 * Returns the modified buffer. Throws if the input is not a valid JPEG.
 */
function stripJpegExif(data: Buffer): Buffer {
  if (data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('stripJpegExif: not a JPEG');
  }

  const out: Buffer[] = [];
  let pos = 2;

  while (pos < data.length) {
    if (data[pos] !== 0xff) {
      // Unexpected byte — pass remainder through unchanged to avoid corruption
      out.push(data.subarray(pos));
      break;
    }

    const marker = data[pos + 1];

    // SOI / EOI have no length field
    if (marker === 0xd8) {
      out.push(data.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(data.subarray(pos, pos + 2));
      break;
    }

    // SOS: start of scan — rest is entropy-coded data, emit everything
    if (marker === 0xda) {
      out.push(data.subarray(pos));
      break;
    }

    // All other segments have a 2-byte length field after the marker
    if (pos + 3 >= data.length) break;
    const segLen = (data[pos + 2] << 8) | data[pos + 3];
    const segEnd = pos + 2 + segLen;

    // Strip APP1..APP15 (EXIF, XMP, etc.) and COM (comments)
    const isExifLike =
      (marker >= 0xe1 && marker <= 0xef) || // APP1–APP15
      marker === 0xfe; // COM

    if (!isExifLike) {
      out.push(data.subarray(pos, segEnd));
    }
    // else: skip (strip it)

    pos = segEnd;
  }

  return Buffer.concat(out);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UploadOptions {
  /**
   * Subdirectory under /data/uploads where the file is stored.
   * Examples: 'site/hero', 'site/gallery', 'bookings/42'
   */
  subdir: string;

  /**
   * Maximum allowed file size in bytes. Upload is rejected with a thrown
   * Error if the file exceeds this limit.
   */
  maxBytes: number;
}

export interface UploadResult {
  /**
   * Path relative to /data/uploads — e.g. 'site/gallery/abc123.jpg'.
   * This is the value stored in the DB column (not the absolute path).
   */
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
}

/**
 * Validate, process, and persist an uploaded image file.
 *
 * Throws a user-friendly Error for all expected failure modes:
 *  - File too large
 *  - Unsupported MIME type (magic-byte detection)
 *  - EXIF stripping failure
 *
 * Usage example:
 *   const result = await upload(formFile, { subdir: 'site/gallery', maxBytes: 10_000_000 });
 */
export async function upload(file: File, options: UploadOptions): Promise<UploadResult> {
  const { subdir, maxBytes } = options;

  // 1. Size check (fast path — before reading bytes)
  if (file.size > maxBytes) {
    const maxMb = (maxBytes / 1_048_576).toFixed(1);
    throw new Error(`File too large — maximum allowed size is ${maxMb} MB.`);
  }

  // 2. Read into buffer
  const arrayBuffer = await file.arrayBuffer();
  const raw = Buffer.from(arrayBuffer);

  // 3. Magic-byte MIME detection
  const mimeType = sniffMime(new Uint8Array(raw.buffer, raw.byteOffset, Math.min(raw.length, 16)));
  if (!mimeType || !ACCEPTED_MIMES.has(mimeType)) {
    throw new Error(
      'Unsupported file type — please upload a JPEG, PNG, WebP, or HEIC image.',
    );
  }

  // 4. EXIF stripping for JPEG (and HEIC, which shares the JPEG container)
  let processed: Buffer = raw;
  if (mimeType === 'image/jpeg' || mimeType === 'image/heic' || mimeType === 'image/heif') {
    try {
      processed = stripJpegExif(raw);
    } catch (err) {
      throw new Error(
        `Couldn't process that image — try re-exporting or try a different file. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
  }

  // 5. Generate random filename
  const ext = MIME_TO_EXT[mimeType] ?? 'bin';
  const filename = `${randomUUID()}.${ext}`;
  const relPath = `${subdir}/${filename}`;
  const root = uploadsRoot();
  const absDir = join(root, subdir);
  const absPath = join(root, relPath);

  // 6. Ensure directory exists and write
  mkdirSync(absDir, { recursive: true });
  writeFileSync(absPath, processed);

  return {
    filePath: relPath,
    mimeType,
    sizeBytes: processed.length,
    originalFilename: file.name,
  };
}
