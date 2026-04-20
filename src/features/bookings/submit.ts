'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { bookingAttachments } from '@/db/schema/booking-attachments';
import { notifications } from '@/db/schema/notifications';
import { services } from '@/db/schema/services';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { matchOrCreateCustomer, bumpLastBookingAt } from '@/features/customers/match';
import { upload } from '@/features/uploads/upload';
import { checkRateLimit } from '@/lib/rate-limit';
import { bookingSubmitSchema } from './validate';
import { isStartAtStillAvailable } from './availability-for-customer';

/**
 * Booking submission server action — Phase 5.
 *
 * Protects the single write endpoint against:
 *   - IP rate-limit abuse         (see STACK.md § Rate limiting and anti-spam)
 *   - Honeypot bots               (silent 200 success; no DB write)
 *   - Invalid input               (Zod schema)
 *   - Stale slot selection        (advance-notice + spacing recheck)
 *   - Race condition double-book  (partial UNIQUE index catches it)
 *
 * Returns a discriminated union so the client UI can branch on shape without
 * parsing error strings.
 */

export type SubmitResult =
  | {
      ok: true;
      token: string;
      /** Set on real (non-honeypot) submissions so the wrapper can fire push. */
      bookingId?: number;
      /** Service name, used to compose the push body. Honeypot path omits it. */
      serviceName?: string;
    }
  | { ok: false; kind: 'rate_limited'; retryAfterMs: number }
  | { ok: false; kind: 'validation'; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: 'slot_taken' }
  | { ok: false; kind: 'service_inactive' }
  | { ok: false; kind: 'internal'; message: string };

/**
 * Derive the rate-limit bucket key from the request. Next 15 server actions
 * can read headers via `next/headers`. We prefer the `x-forwarded-for` hop
 * that Caddy injects and fall back to `x-real-ip`; in dev without a proxy
 * we key on `local` so the limit is per-process (not per-request).
 */
async function resolveRequestIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    // First hop is the client; the rest is the proxy chain.
    return xff.split(',')[0].trim();
  }
  return h.get('x-real-ip') ?? 'local';
}

/** Pull the configured per-hour rate limit (default 30) from env. */
function getRateLimitPerHour(): number {
  const raw = process.env.BOOKING_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Core submission pipeline — extracted from the server action entry so it can
 * be unit-tested with a DI'd DB + IP. The exported `submitBooking()` wraps
 * this with the Next.js header lookup + real DB.
 */
export interface SubmitBookingCore {
  formData: FormData;
  db: ReturnType<typeof getDb>;
  ip: string;
  now?: Date;
  /**
   * Optional upload function injection — defaults to the real /data/uploads
   * writer. Tests pass a stub to avoid touching disk.
   */
  uploader?: typeof upload;
  /** Token generator — overridable in tests for determinism. */
  generateToken?: () => string;
  /** Rate-limit knob override; defaults to env. */
  rateLimitPerHour?: number;
}

export async function submitBookingCore(
  opts: SubmitBookingCore,
): Promise<SubmitResult> {
  const {
    formData,
    db,
    ip,
    now = new Date(),
    uploader = upload,
    generateToken = randomUUID,
    rateLimitPerHour = getRateLimitPerHour(),
  } = opts;

  // ---- 1. Rate limit ------------------------------------------------------
  const rl = checkRateLimit(
    `booking:${ip}`,
    rateLimitPerHour,
    3_600_000,
    now.getTime(),
  );
  if (!rl.allowed) {
    return { ok: false, kind: 'rate_limited', retryAfterMs: rl.retryAfterMs };
  }

  // ---- 2. Honeypot --------------------------------------------------------
  const honeypot = String(formData.get('honeypot') ?? '').trim();
  if (honeypot.length > 0) {
    // Silent success per STACK.md: pretend the submission worked, return a
    // token-shaped string so the client redirect doesn't reveal detection.
    // The token is NOT inserted anywhere — navigating there will 404.
    return { ok: true, token: generateToken() };
  }

  // ---- 3. Zod validation --------------------------------------------------
  // FormData.get returns `null` for absent keys, but Zod treats null and
  // undefined differently in the presence of `.optional()` / `.default()`.
  // Normalize absence to `undefined` so defaults kick in cleanly.
  const optional = (key: string): string | undefined => {
    const v = formData.get(key);
    return v == null ? undefined : String(v);
  };
  const parsed = bookingSubmitSchema.safeParse({
    serviceId: formData.get('serviceId'),
    startAt: formData.get('startAt'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: optional('email'),
    address: formData.get('address'),
    notes: optional('notes'),
    honeypot: optional('honeypot'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, kind: 'validation', fieldErrors };
  }
  const data = parsed.data;

  // ---- 4. Service must exist + be active ---------------------------------
  const svc = db
    .select()
    .from(services)
    .where(eq(services.id, data.serviceId))
    .limit(1)
    .all()[0];
  if (!svc || svc.active !== 1) {
    return { ok: false, kind: 'service_inactive' };
  }

  // ---- 5. Slot-availability pre-check ------------------------------------
  if (!isStartAtStillAvailable(data.startAt, db, now)) {
    return { ok: false, kind: 'slot_taken' };
  }

  // ---- 6. Match/create customer + insert booking (DB tx) -----------------
  const cfgRows = db
    .select({
      maxBookingPhotos: siteConfigTable.maxBookingPhotos,
      bookingPhotoMaxBytes: siteConfigTable.bookingPhotoMaxBytes,
    })
    .from(siteConfigTable)
    .limit(1)
    .all();
  const cfg = cfgRows[0];
  if (!cfg) {
    return { ok: false, kind: 'internal', message: 'site_config not initialized' };
  }

  const match = matchOrCreateCustomer(
    {
      name: data.name,
      phone: data.phone,
      email: data.email,
      address: data.address,
    },
    db,
    () => now.toISOString(),
  );

  const token = generateToken();
  const nowIso = now.toISOString();
  let bookingId: number;
  try {
    const insertedRows = db
      .insert(bookings)
      .values({
        token,
        customerId: match.customerId,
        addressId: match.addressId,
        addressText: data.address,
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email,
        serviceId: data.serviceId,
        startAt: data.startAt,
        notes: data.notes,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .returning()
      .all();
    bookingId = insertedRows[0].id;
  } catch (err) {
    // The partial UNIQUE index (bookings_active_start) throws on conflict.
    // better-sqlite3 surfaces this as a SqliteError with code
    // SQLITE_CONSTRAINT_UNIQUE; we match on the message to avoid importing
    // the private error class.
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(msg)) {
      return { ok: false, kind: 'slot_taken' };
    }
    return { ok: false, kind: 'internal', message: msg };
  }

  // Bump the customer's last_booking_at for INDEX-book sort order.
  bumpLastBookingAt(match.customerId, data.startAt, db);

  // In-app notification — the local replica of the Web Push fan-out so the
  // Inbox tab badge lights up regardless of whether the admin has subscribed
  // to push (or has push delivery working on this device). Best-effort: a
  // failure here must not roll back the booking, which is already committed.
  try {
    db.insert(notifications)
      .values({
        kind: 'booking_submitted',
        bookingId,
        payloadJson: JSON.stringify({
          bookingId,
          token,
          customerName: data.name,
          serviceName: svc.name,
          startAt: data.startAt,
        }),
        read: 0,
        createdAt: nowIso,
      })
      .run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'warn',
        msg: 'submit: in-app notification insert failed',
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // ---- 7. Photo uploads ---------------------------------------------------
  const photos = formData.getAll('photos').filter((v): v is File => v instanceof File);
  // Respect max count — silently drop extras. (Client UI also enforces the
  // cap, and browsers won't let the user pick more than the `multiple`
  // attribute allows, but we're defensive.)
  const kept = photos.slice(0, cfg.maxBookingPhotos);
  for (const photo of kept) {
    if (photo.size === 0) continue; // empty placeholder from an untouched <input>
    try {
      const result = await uploader(photo, {
        subdir: `bookings/${bookingId}`,
        maxBytes: cfg.bookingPhotoMaxBytes,
      });
      db.insert(bookingAttachments)
        .values({
          bookingId,
          filePath: result.filePath,
          originalFilename: result.originalFilename,
          mimeType: result.mimeType,
          sizeBytes: result.sizeBytes,
          createdAt: now.toISOString(),
        })
        .run();
    } catch (err) {
      // One bad photo shouldn't kill the whole booking — log and continue.
      // Phase 8 structured logger will format this properly; for now,
      // plain console is fine.
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'warn',
          msg: 'booking photo upload failed',
          bookingId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return { ok: true, token, bookingId, serviceName: svc.name };
}

/**
 * Server-action entry point called by the <form action={submitBooking}> tag.
 * Wraps `submitBookingCore` with the Next-specific header/DB lookup. The
 * core handles the in-app inbox notification row that drives the admin
 * Inbox-tab badge.
 */
export async function submitBooking(formData: FormData): Promise<SubmitResult> {
  const db = getDb();
  const ip = await resolveRequestIp();
  return submitBookingCore({ formData, db, ip });
}
