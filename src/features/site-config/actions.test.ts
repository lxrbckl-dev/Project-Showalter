/**
 * Unit tests for site-config server actions.
 *
 * Tests the Zod validation layer in isolation — does not require a DB
 * (we mock the DB module so .update().set().run() is a no-op).
 *
 * Each action takes (_prev, FormData) and returns ActionResult.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock next/cache so revalidatePath is a no-op in tests.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Mock the DB so writes don't require a real SQLite file.
vi.mock('@/db', () => ({
  getDb: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
  })),
}));

import {
  updateContact,
  updateSmsTemplate,
  updateTemplates,
  updateSettings,
  type ActionResult,
} from './actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    form.append(k, v);
  }
  return form;
}

const PREV_OK: ActionResult = { ok: true };

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

describe('updateContact', () => {
  it('accepts valid E.164 phone', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '+19133097340', email: '', tiktokUrl: '', bio: '' }));
    expect(result.ok).toBe(true);
  });

  it('rejects phone not in E.164 format', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '9133097340', email: '', tiktokUrl: '', bio: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.phone).toBeDefined();
  });

  it('accepts empty phone (optional)', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: '', tiktokUrl: '', bio: '' }));
    expect(result.ok).toBe(true);
  });

  it('rejects invalid email', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: 'not-an-email', tiktokUrl: '', bio: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toBeDefined();
  });

  it('accepts valid email', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: 'sawyer@example.com', tiktokUrl: '', bio: '' }));
    expect(result.ok).toBe(true);
  });

  it('rejects bio longer than 2000 chars', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: '', tiktokUrl: '', bio: 'x'.repeat(2001) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bio).toBeDefined();
  });

  it('accepts bio exactly 2000 chars', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: '', tiktokUrl: '', bio: 'x'.repeat(2000) }));
    expect(result.ok).toBe(true);
  });

  it('rejects invalid tiktokUrl', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: '', tiktokUrl: 'not a url', bio: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.tiktokUrl).toBeDefined();
  });

  it('accepts valid tiktokUrl', async () => {
    const result = await updateContact(PREV_OK, fd({ phone: '', email: '', tiktokUrl: 'https://tiktok.com/@test', bio: '' }));
    expect(result.ok).toBe(true);
  });

  it('accepts empty dateOfBirth (optional)', async () => {
    const result = await updateContact(
      PREV_OK,
      fd({ phone: '', email: '', tiktokUrl: '', bio: '', dateOfBirth: '' }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts valid dateOfBirth in YYYY-MM-DD', async () => {
    const result = await updateContact(
      PREV_OK,
      fd({ phone: '', email: '', tiktokUrl: '', bio: '', dateOfBirth: '2010-06-15' }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects malformed dateOfBirth', async () => {
    const result = await updateContact(
      PREV_OK,
      fd({ phone: '', email: '', tiktokUrl: '', bio: '', dateOfBirth: '06/15/2010' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dateOfBirth).toBeDefined();
  });

  it('rejects impossible calendar dates (Feb 30)', async () => {
    const result = await updateContact(
      PREV_OK,
      fd({ phone: '', email: '', tiktokUrl: '', bio: '', dateOfBirth: '2010-02-30' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dateOfBirth).toBeDefined();
  });

  it('rejects dateOfBirth in the future', async () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 5);
    const yyyy = future.getUTCFullYear();
    const mm = String(future.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(future.getUTCDate()).padStart(2, '0');
    const result = await updateContact(
      PREV_OK,
      fd({
        phone: '',
        email: '',
        tiktokUrl: '',
        bio: '',
        dateOfBirth: `${yyyy}-${mm}-${dd}`,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dateOfBirth).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateSmsTemplate
// ---------------------------------------------------------------------------

describe('updateSmsTemplate', () => {
  it('accepts non-empty template', async () => {
    const result = await updateSmsTemplate(PREV_OK, fd({ smsTemplate: 'Hi [name], text Sawyer.' }));
    expect(result.ok).toBe(true);
  });

  it('rejects empty template', async () => {
    const result = await updateSmsTemplate(PREV_OK, fd({ smsTemplate: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.smsTemplate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateTemplates
// ---------------------------------------------------------------------------

const VALID_TEMPLATES = {
  templateConfirmationEmail: 'Hi [name], confirmed.',
  templateConfirmationSms: 'Hi [name], confirmed SMS.',
  templateDeclineEmail: 'Hi [name], declined.',
  templateDeclineSms: 'Hi [name], declined SMS.',
  templateReviewRequestEmail: 'Hi [name], review [link].',
  templateReviewRequestSms: 'Hi [name], review [link].',
  templateRescheduleEmail: 'Hi [name], rescheduled.',
  templateRescheduleSms: 'Hi [name], rescheduled SMS.',
};

describe('updateTemplates', () => {
  it('accepts all valid templates', async () => {
    const result = await updateTemplates(PREV_OK, fd(VALID_TEMPLATES));
    expect(result.ok).toBe(true);
  });

  it('rejects empty templateConfirmationEmail', async () => {
    const result = await updateTemplates(PREV_OK, fd({ ...VALID_TEMPLATES, templateConfirmationEmail: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.templateConfirmationEmail).toBeDefined();
  });

  it('rejects empty templateReviewRequestSms', async () => {
    const result = await updateTemplates(PREV_OK, fd({ ...VALID_TEMPLATES, templateReviewRequestSms: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.templateReviewRequestSms).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// updateSettings
// ---------------------------------------------------------------------------

const currentYear = new Date().getFullYear();

const VALID_SETTINGS = {
  siteTitle: 'Sawyer Showalter Service',
  businessFoundedYear: '2023',
  bookingHorizonWeeks: '4',
  startTimeIncrementMinutes: '30',
  bookingSpacingMinutes: '60',
  minAdvanceNoticeHours: '36',
  maxBookingPhotos: '3',
  bookingPhotoMaxBytes: '10485760',
  photoRetentionDaysAfterResolve: '30',
  showLandingStats: 'on',
  minReviewsForLandingStats: '3',
  minRatingForAutoPublish: '4',
  autoPublishTopReviewPhotos: 'on',
  timezone: 'America/Chicago',
};

describe('updateSettings', () => {
  it('accepts all valid settings', async () => {
    const result = await updateSettings(PREV_OK, fd(VALID_SETTINGS));
    expect(result.ok).toBe(true);
  });

  it('rejects businessFoundedYear above current year', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, businessFoundedYear: String(currentYear + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.businessFoundedYear).toBeDefined();
  });

  it('accepts businessFoundedYear equal to current year', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, businessFoundedYear: String(currentYear) }));
    expect(result.ok).toBe(true);
  });

  it('rejects bookingHorizonWeeks of 0', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, bookingHorizonWeeks: '0' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bookingHorizonWeeks).toBeDefined();
  });

  it('accepts bookingHorizonWeeks of 1', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, bookingHorizonWeeks: '1' }));
    expect(result.ok).toBe(true);
  });

  it('rejects startTimeIncrementMinutes of 25 (not in allowed set)', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, startTimeIncrementMinutes: '25' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startTimeIncrementMinutes).toBeDefined();
  });

  it.each([15, 20, 30, 60])('accepts startTimeIncrementMinutes of %d', async (v) => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, startTimeIncrementMinutes: String(v) }));
    expect(result.ok).toBe(true);
  });

  it('rejects bookingSpacingMinutes above 240', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, bookingSpacingMinutes: '241' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bookingSpacingMinutes).toBeDefined();
  });

  it('accepts bookingSpacingMinutes of 0', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, bookingSpacingMinutes: '0' }));
    expect(result.ok).toBe(true);
  });

  it('accepts bookingSpacingMinutes of 240', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, bookingSpacingMinutes: '240' }));
    expect(result.ok).toBe(true);
  });

  it('rejects bookingSpacingMinutes of -1', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, bookingSpacingMinutes: '-1' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bookingSpacingMinutes).toBeDefined();
  });

  it('rejects invalid timezone', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, timezone: 'Fake/Timezone' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.timezone).toBeDefined();
  });

  it('accepts America/New_York timezone', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, timezone: 'America/New_York' }));
    expect(result.ok).toBe(true);
  });

  it('treats missing showLandingStats as unchecked (0)', async () => {
    // When a checkbox is unchecked, the field is absent from FormData
    const data = fd({ ...VALID_SETTINGS });
    data.delete('showLandingStats');
    const result = await updateSettings(PREV_OK, data);
    expect(result.ok).toBe(true);
  });

  it('rejects minRatingForAutoPublish above 5', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, minRatingForAutoPublish: '6' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.minRatingForAutoPublish).toBeDefined();
  });

  it('rejects minRatingForAutoPublish of 0', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, minRatingForAutoPublish: '0' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.minRatingForAutoPublish).toBeDefined();
  });

  // --- siteTitle ---

  it('accepts a normal siteTitle', async () => {
    const result = await updateSettings(
      PREV_OK,
      fd({ ...VALID_SETTINGS, siteTitle: 'Sawyer Showalter Service' }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects empty siteTitle', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, siteTitle: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.siteTitle).toBeDefined();
  });

  it('rejects whitespace-only siteTitle (trimmed to empty)', async () => {
    const result = await updateSettings(PREV_OK, fd({ ...VALID_SETTINGS, siteTitle: '   ' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.siteTitle).toBeDefined();
  });

  it('accepts siteTitle exactly 60 chars', async () => {
    const result = await updateSettings(
      PREV_OK,
      fd({ ...VALID_SETTINGS, siteTitle: 'x'.repeat(60) }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects siteTitle longer than 60 chars', async () => {
    const result = await updateSettings(
      PREV_OK,
      fd({ ...VALID_SETTINGS, siteTitle: 'x'.repeat(61) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.siteTitle).toBeDefined();
  });
});
