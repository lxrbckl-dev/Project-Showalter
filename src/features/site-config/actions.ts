'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/db';
import { siteConfig } from '@/db/schema/site-config';
import { upload } from '@/features/uploads/upload';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * All supported IANA timezones (computed once at module-load time).
 * `Intl.supportedValuesOf` is available in Node 18+.
 */
const SUPPORTED_TIMEZONES = new Set(
  (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [],
);

const CURRENT_YEAR = new Date().getFullYear();

// E.164 phone — e.g. +19133097340
const e164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +19133097340)');

// RFC 5321-compatible email (simple, not overly pedantic)
const rfc5321Email = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Must be a valid email address')
  .max(254, 'Email must be ≤ 254 characters');

// Valid URL
const validUrl = z
  .string()
  .trim()
  .refine((v) => {
    if (!v) return true; // allow empty/null — optional fields
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }, 'Must be a valid URL');

// Timezone
const timezone = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .refine((v) => SUPPORTED_TIMEZONES.has(v), 'Must be a valid IANA timezone');

// ---------------------------------------------------------------------------
// Action result type
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]> };

function fieldErrors(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_root';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact tab
// ---------------------------------------------------------------------------

// ISO-8601 calendar date (YYYY-MM-DD). Used for Sawyer's DOB — see
// `src/lib/age.ts` for the consuming side. Validated as a real calendar date
// (rejects things like 2010-02-30) and required not to be in the future.
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use YYYY-MM-DD format')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, 'Must be a valid calendar date')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    // Compare at UTC midnight — DOB is a calendar date, timezone precision
    // isn't needed for "is this in the future". A DOB of today is fine.
    const dob = Date.UTC(y, m - 1, d);
    const todayUtc = (() => {
      const now = new Date();
      return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    })();
    return dob <= todayUtc;
  }, 'Date of birth cannot be in the future');

const ContactSchema = z.object({
  phone: e164.optional().or(z.literal('')),
  email: rfc5321Email.optional().or(z.literal('')),
  tiktokUrl: validUrl.optional().or(z.literal('')),
  bio: z
    .string()
    .trim()
    .max(2000, 'Bio must be ≤ 2000 characters')
    .optional()
    .or(z.literal('')),
  dateOfBirth: isoDate.optional().or(z.literal('')),
});

export async function updateContact(
  _prev: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  const raw = {
    phone: data.get('phone') as string,
    email: data.get('email') as string,
    tiktokUrl: data.get('tiktokUrl') as string,
    bio: data.get('bio') as string,
    dateOfBirth: (data.get('dateOfBirth') as string) ?? '',
  };

  const parsed = ContactSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  db.update(siteConfig)
    .set({
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      tiktokUrl: parsed.data.tiktokUrl || null,
      bio: parsed.data.bio || null,
      dateOfBirth: parsed.data.dateOfBirth || null,
    })
    .run();

  revalidatePath('/');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SMS fallback tab
// ---------------------------------------------------------------------------

const SmsSchema = z.object({
  smsTemplate: z.string().trim().min(1, 'SMS template is required'),
});

export async function updateSmsTemplate(
  _prev: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  const raw = { smsTemplate: data.get('smsTemplate') as string };
  const parsed = SmsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  db.update(siteConfig).set({ smsTemplate: parsed.data.smsTemplate }).run();
  revalidatePath('/');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Templates tab
// ---------------------------------------------------------------------------

const TemplatesSchema = z.object({
  templateConfirmationEmail: z.string().trim().min(1, 'Template is required'),
  templateConfirmationSms: z.string().trim().min(1, 'Template is required'),
  templateDeclineEmail: z.string().trim().min(1, 'Template is required'),
  templateDeclineSms: z.string().trim().min(1, 'Template is required'),
  templateReviewRequestEmail: z.string().trim().min(1, 'Template is required'),
  templateReviewRequestSms: z.string().trim().min(1, 'Template is required'),
});

export async function updateTemplates(
  _prev: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  const raw = {
    templateConfirmationEmail: data.get('templateConfirmationEmail') as string,
    templateConfirmationSms: data.get('templateConfirmationSms') as string,
    templateDeclineEmail: data.get('templateDeclineEmail') as string,
    templateDeclineSms: data.get('templateDeclineSms') as string,
    templateReviewRequestEmail: data.get('templateReviewRequestEmail') as string,
    templateReviewRequestSms: data.get('templateReviewRequestSms') as string,
  };

  const parsed = TemplatesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  db.update(siteConfig).set(parsed.data).run();
  revalidatePath('/');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

// Public business name shown in the Hero eyebrow, SEO metadata, OG image,
// back-links, and email subjects. Trimmed, non-empty, capped at 60 chars so
// it still fits in SEO `<title>` / OG card layouts without wrapping.
const siteTitle = z
  .string()
  .trim()
  .min(1, 'Site title is required')
  .max(60, 'Site title must be ≤ 60 characters');

const SettingsSchema = z
  .object({
    siteTitle,
    businessFoundedYear: z
      .coerce
      .number()
      .int('Must be an integer')
      .max(CURRENT_YEAR, `Business year must be ≤ ${CURRENT_YEAR}`),
    bookingHorizonWeeks: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(1, 'Booking horizon must be ≥ 1'),
    startTimeIncrementMinutes: z
      .coerce
      .number()
      .int('Must be an integer')
      .refine((v) => [15, 20, 30, 60].includes(v), 'Increment must be 15, 20, 30, or 60'),
    bookingSpacingMinutes: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(0, 'Spacing must be ≥ 0')
      .max(240, 'Spacing must be ≤ 240'),
    minAdvanceNoticeHours: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(0, 'Advance notice must be ≥ 0'),
    maxBookingPhotos: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(0, 'Must be ≥ 0'),
    bookingPhotoMaxBytes: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(1, 'Must be ≥ 1'),
    photoRetentionDaysAfterResolve: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(0, 'Must be ≥ 0'),
    showLandingStats: z.coerce.number().int().min(0).max(1),
    minReviewsForLandingStats: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(0, 'Must be ≥ 0'),
    minRatingForAutoPublish: z
      .coerce
      .number()
      .int('Must be an integer')
      .min(1, 'Must be ≥ 1')
      .max(5, 'Must be ≤ 5'),
    autoPublishTopReviewPhotos: z.coerce.number().int().min(0).max(1),
    timezone,
  });

export async function updateSettings(
  _prev: ActionResult,
  data: FormData,
): Promise<ActionResult> {
  // Boolean switches send the string 'on' when checked, or are absent when unchecked.
  const raw = {
    siteTitle: data.get('siteTitle') as string,
    businessFoundedYear: data.get('businessFoundedYear') as string,
    bookingHorizonWeeks: data.get('bookingHorizonWeeks') as string,
    startTimeIncrementMinutes: data.get('startTimeIncrementMinutes') as string,
    bookingSpacingMinutes: data.get('bookingSpacingMinutes') as string,
    minAdvanceNoticeHours: data.get('minAdvanceNoticeHours') as string,
    maxBookingPhotos: data.get('maxBookingPhotos') as string,
    bookingPhotoMaxBytes: data.get('bookingPhotoMaxBytes') as string,
    photoRetentionDaysAfterResolve: data.get('photoRetentionDaysAfterResolve') as string,
    showLandingStats: data.get('showLandingStats') === 'on' ? '1' : '0',
    minReviewsForLandingStats: data.get('minReviewsForLandingStats') as string,
    minRatingForAutoPublish: data.get('minRatingForAutoPublish') as string,
    autoPublishTopReviewPhotos: data.get('autoPublishTopReviewPhotos') === 'on' ? '1' : '0',
    timezone: data.get('timezone') as string,
  };

  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const db = getDb();
  db.update(siteConfig).set(parsed.data).run();
  revalidatePath('/');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hero image tab (Phase 3C)
// ---------------------------------------------------------------------------

export type HeroActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upload a new hero image. Validates, strips EXIF, writes to
 * /data/uploads/site/hero/<uuid>.jpg, and updates site_config.hero_image_path.
 *
 * The previous hero file is NOT deleted from disk (no hard deletions).
 */
export async function uploadHeroImage(
  _prev: HeroActionResult,
  data: FormData,
): Promise<HeroActionResult> {
  const file = data.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file provided.' };
  }

  let result: Awaited<ReturnType<typeof upload>>;
  try {
    result = await upload(file, { subdir: 'site/hero', maxBytes: 10_485_760 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Upload failed.' };
  }

  const db = getDb();
  db.update(siteConfig).set({ heroImagePath: `/uploads/${result.filePath}` }).run();
  revalidatePath('/');
  return { ok: true };
}

/**
 * Remove the current hero image. Sets hero_image_path = NULL in site_config.
 * The file is kept on disk (no hard deletions).
 */
export async function removeHeroImage(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: HeroActionResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _data: FormData,
): Promise<HeroActionResult> {
  const db = getDb();
  db.update(siteConfig).set({ heroImagePath: null }).run();
  revalidatePath('/');
  return { ok: true };
}
