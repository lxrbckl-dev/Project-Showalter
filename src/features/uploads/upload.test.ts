/**
 * Unit tests for the shared upload module.
 *
 * Covers:
 *  1. MIME sniffing (magic bytes)
 *  2. EXIF stripping (roundtrip: JPEG with EXIF → stripped JPEG has no EXIF)
 *  3. Path traversal defense (serve.ts)
 *  4. upload() function: accepts valid images, rejects bad MIME / oversized
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sniffMime, ACCEPTED_MIMES, upload } from './upload';
import { serveUpload } from './serve';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers: build minimal valid image buffers with magic bytes
// ---------------------------------------------------------------------------

function jpegMagic(extraBytes = 0): Buffer {
  // Minimal JPEG: SOI + APP0 (JFIF) + EOI
  // FF D8 FF E0 [len=16] JFIF\0 ... FF D9
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff; app0[1] = 0xd8; // SOI
  app0[2] = 0xff; app0[3] = 0xe0; // APP0 marker
  app0[4] = 0x00; app0[5] = 0x10; // length = 16
  // Fill the APP0 data bytes
  Buffer.from('JFIF\0').copy(app0, 6);
  app0[16] = 0xff; app0[17] = 0xd9; // EOI
  if (extraBytes === 0) return app0;
  return Buffer.concat([app0, Buffer.alloc(extraBytes)]);
}

function pngMagic(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47;
  buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a;
  // Minimal IHDR
  buf[8] = 0x00; buf[9] = 0x00; buf[10] = 0x00; buf[11] = 0x0d;
  buf[12] = 0x49; buf[13] = 0x48; buf[14] = 0x44; buf[15] = 0x52;
  return buf;
}

function webpMagic(): Buffer {
  const buf = Buffer.alloc(16);
  // RIFF
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  // 4 bytes file size (arbitrary)
  buf[4] = 0x00; buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x00;
  // WEBP
  buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50;
  buf[12] = 0x56; buf[13] = 0x50; buf[14] = 0x38; buf[15] = 0x20;
  return buf;
}

function heicMagic(): Buffer {
  const buf = Buffer.alloc(12);
  // box size
  buf[0] = 0x00; buf[1] = 0x00; buf[2] = 0x00; buf[3] = 0x18;
  // ftyp
  buf[4] = 0x66; buf[5] = 0x74; buf[6] = 0x79; buf[7] = 0x70;
  // brand = heic
  buf[8] = 0x68; buf[9] = 0x65; buf[10] = 0x69; buf[11] = 0x63;
  return buf;
}

// ---------------------------------------------------------------------------
// 1. MIME sniffing
// ---------------------------------------------------------------------------

describe('sniffMime', () => {
  it('detects JPEG from magic bytes', () => {
    expect(sniffMime(new Uint8Array(jpegMagic()))).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes', () => {
    expect(sniffMime(new Uint8Array(pngMagic()))).toBe('image/png');
  });

  it('detects WebP from magic bytes', () => {
    expect(sniffMime(new Uint8Array(webpMagic()))).toBe('image/webp');
  });

  it('detects HEIC from magic bytes', () => {
    expect(sniffMime(new Uint8Array(heicMagic()))).toBe('image/heic');
  });

  it('returns null for random bytes', () => {
    const buf = Buffer.alloc(16, 0xab);
    expect(sniffMime(new Uint8Array(buf))).toBeNull();
  });

  it('returns null for too-short buffer', () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it('ACCEPTED_MIMES includes all sniffable types', () => {
    expect(ACCEPTED_MIMES.has('image/jpeg')).toBe(true);
    expect(ACCEPTED_MIMES.has('image/png')).toBe(true);
    expect(ACCEPTED_MIMES.has('image/webp')).toBe(true);
    expect(ACCEPTED_MIMES.has('image/heic')).toBe(true);
    expect(ACCEPTED_MIMES.has('image/heif')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. EXIF stripping roundtrip
// ---------------------------------------------------------------------------

describe('EXIF stripping via stripJpegExif (internal)', () => {
  it('strips APP1 EXIF segment from JPEG', async () => {
    // Build a JPEG with a fake APP1 segment injected
    // SOI + APP1 (with fake EXIF data) + APP0 + SOSdata + EOI
    const soi = Buffer.from([0xff, 0xd8]);
    // APP1: FF E1 + length (big-endian, includes itself) + 4 bytes data
    const app1Len = 4 + 2; // 2 bytes len field + 4 bytes data
    const app1 = Buffer.from([0xff, 0xe1, 0x00, app1Len, 0xde, 0xad, 0xbe, 0xef]);
    // APP0: FF E0 + length 16 + JFIF data
    const app0Len = 16;
    const app0 = Buffer.alloc(2 + app0Len);
    app0[0] = 0xff; app0[1] = 0xe0;
    app0[2] = 0x00; app0[3] = app0Len;
    Buffer.from('JFIF\0').copy(app0, 4);
    // SOS marker + fake image data + EOI
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
    const imageData = Buffer.from([0xf8, 0xf8, 0xf8]);
    const eoi = Buffer.from([0xff, 0xd9]);

    const jpeg = Buffer.concat([soi, app1, app0, sos, imageData, eoi]);

    // Dynamically load the internal function via the module
    const { upload: _u, ...rest } = await import('./upload');
    void rest;

    // We test the stripping indirectly via the upload function with a mocked fs.
    // Instead test directly using the export through a test-accessible form.
    // The key invariant: output should NOT contain the APP1 marker bytes
    // APP1 = FF E1 — check the raw JPEG without APP1

    // Use exifr to verify EXIF presence in input vs absence in output
    // We'll use the internal stripJpegExif by re-reading the test:
    // The simplest approach: call upload() with UPLOADS_ROOT set to a temp dir

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe1-test-'));
    process.env.UPLOADS_ROOT = tmpDir;

    const file = new File([jpeg], 'test.jpg', { type: 'image/jpeg' });
    const result = await _u(file, { subdir: 'test', maxBytes: 1_000_000 });

    // Read output and check APP1 is gone
    const outputPath = path.join(tmpDir, result.filePath);
    const outputBytes = fs.readFileSync(outputPath);

    // Find APP1 marker (FF E1) in output — should not exist
    let foundApp1 = false;
    for (let i = 0; i < outputBytes.length - 1; i++) {
      if (outputBytes[i] === 0xff && outputBytes[i + 1] === 0xe1) {
        foundApp1 = true;
        break;
      }
    }

    expect(foundApp1).toBe(false);
    expect(result.mimeType).toBe('image/jpeg');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOADS_ROOT;
  });
});

// ---------------------------------------------------------------------------
// 3. Path traversal defense (serveUpload)
// ---------------------------------------------------------------------------

describe('serveUpload path traversal defense', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe1-serve-test-'));
    process.env.UPLOADS_ROOT = tmpDir;
    // Create a valid PNG file in the temp dir
    const pngDir = path.join(tmpDir, 'site', 'gallery');
    fs.mkdirSync(pngDir, { recursive: true });
    const pngBuf = pngMagic();
    // Write a complete-ish PNG so the MIME check passes
    fs.writeFileSync(path.join(pngDir, 'test.png'), pngBuf);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOADS_ROOT;
  });

  it('returns 404 for ".." path segments', async () => {
    const response = serveUpload(['..', 'etc', 'passwd']);
    expect(response.status).toBe(404);
  });

  it('returns 404 for paths with ".." in segment', async () => {
    const response = serveUpload(['site', '..%2Fetc', 'passwd']);
    expect(response.status).toBe(404);
  });

  it('returns 404 for absolute-looking traversal', async () => {
    const response = serveUpload(['..', '..', '..', 'etc', 'passwd']);
    expect(response.status).toBe(404);
  });

  it('returns 200 for valid PNG file', async () => {
    const response = serveUpload(['site', 'gallery', 'test.png']);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('returns 404 for non-existent file', async () => {
    const response = serveUpload(['site', 'gallery', 'missing.png']);
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 4. upload() accepts valid images, rejects bad MIME / oversized
// ---------------------------------------------------------------------------

describe('upload() validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe1-upload-test-'));
    process.env.UPLOADS_ROOT = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOADS_ROOT;
  });

  it('accepts a valid PNG', async () => {
    const file = new File([pngMagic()], 'photo.png', { type: 'image/png' });
    const result = await upload(file, { subdir: 'test', maxBytes: 1_000_000 });
    expect(result.mimeType).toBe('image/png');
    expect(result.filePath).toMatch(/^test\/.+\.png$/);
    expect(result.originalFilename).toBe('photo.png');
  });

  it('accepts a valid WebP', async () => {
    const file = new File([webpMagic()], 'photo.webp', { type: 'image/webp' });
    const result = await upload(file, { subdir: 'test', maxBytes: 1_000_000 });
    expect(result.mimeType).toBe('image/webp');
  });

  it('rejects a file exceeding maxBytes', async () => {
    const large = Buffer.concat([pngMagic(), Buffer.alloc(1000)]);
    const file = new File([large], 'big.png', { type: 'image/png' });
    await expect(upload(file, { subdir: 'test', maxBytes: 100 })).rejects.toThrow(/too large/);
  });

  it('rejects a file with incorrect magic bytes (renamed .exe → .jpg)', async () => {
    const fakeJpg = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const file = new File([fakeJpg], 'fake.jpg', { type: 'image/jpeg' });
    await expect(upload(file, { subdir: 'test', maxBytes: 1_000_000 })).rejects.toThrow(
      /Unsupported file type/,
    );
  });

  it('rejects a plain text file with .png extension', async () => {
    const text = Buffer.from('not an image at all');
    const file = new File([text], 'trick.png', { type: 'image/png' });
    await expect(upload(file, { subdir: 'test', maxBytes: 1_000_000 })).rejects.toThrow(
      /Unsupported file type/,
    );
  });

  it('uses a random UUID filename (no original filename on disk)', async () => {
    const file = new File([pngMagic()], 'my-private-name.png', { type: 'image/png' });
    const result = await upload(file, { subdir: 'test', maxBytes: 1_000_000 });
    expect(result.filePath).not.toContain('my-private-name');
    // UUID format check
    expect(result.filePath).toMatch(
      /^test\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
  });
});
