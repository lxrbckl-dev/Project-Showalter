'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { updateSettings, type ActionResult } from '@/features/site-config/actions';
import type { SiteConfigRow } from '@/db/schema/site-config';

interface SettingsFormProps {
  config: SiteConfigRow;
}

const initialState: ActionResult = { ok: true };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-[hsl(var(--destructive))]">{errors.join(', ')}</p>;
}

export function SettingsForm({ config }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateSettings, initialState);

  const err = (field: string) =>
    state.ok === false ? (state.errors[field] ?? []) : [];

  // Same dirty-state + sticky-save-bar pattern as ContactForm so all four
  // Content tabs feel identical.
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (state.ok === true && !isPending) {
      setIsDirty(false);
    }
  }, [state, isPending]);

  function discard(): void {
    formRef.current?.reset();
    setIsDirty(false);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={() => setIsDirty(true)}
      className="space-y-8 pb-20"
      data-testid="settings-form"
    >
      {/* --- Business --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Business
        </h3>

        <div className="space-y-2">
          <label htmlFor="siteTitle" className="block text-sm font-medium">
            Site title
          </label>
          <Input
            id="siteTitle"
            name="siteTitle"
            type="text"
            defaultValue={config.siteTitle}
            placeholder="Sawyer Showalter Service"
            maxLength={60}
            data-testid="settings-site-title"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Shown at the top of the landing page, in the browser tab title, and on social-share cards.
            1–60 characters.
          </p>
          <FieldError errors={err('siteTitle')} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="businessFoundedYear" className="block text-sm font-medium">
              Year founded
            </label>
            <Input
              id="businessFoundedYear"
              name="businessFoundedYear"
              type="number"
              defaultValue={config.businessFoundedYear}
              min={1900}
              max={new Date().getFullYear()}
            />
            <FieldError errors={err('businessFoundedYear')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="timezone" className="block text-sm font-medium">
              Timezone
            </label>
            <Input
              id="timezone"
              name="timezone"
              type="text"
              defaultValue={config.timezone}
              placeholder="America/Chicago"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Must be a valid IANA timezone (e.g. America/Chicago, America/New_York)
            </p>
            <FieldError errors={err('timezone')} />
          </div>
        </div>
      </section>

      {/* --- Booking knobs --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Booking
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="bookingHorizonWeeks" className="block text-sm font-medium">
              Booking horizon (weeks)
            </label>
            <Input
              id="bookingHorizonWeeks"
              name="bookingHorizonWeeks"
              type="number"
              defaultValue={config.bookingHorizonWeeks}
              min={1}
            />
            <FieldError errors={err('bookingHorizonWeeks')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="startTimeIncrementMinutes" className="block text-sm font-medium">
              Start time increment (minutes)
            </label>
            <select
              id="startTimeIncrementMinutes"
              name="startTimeIncrementMinutes"
              defaultValue={config.startTimeIncrementMinutes}
              className="flex h-10 w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              {[15, 20, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <FieldError errors={err('startTimeIncrementMinutes')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="bookingSpacingMinutes" className="block text-sm font-medium">
              Booking spacing (minutes, 0–240)
            </label>
            <Input
              id="bookingSpacingMinutes"
              name="bookingSpacingMinutes"
              type="number"
              defaultValue={config.bookingSpacingMinutes}
              min={0}
              max={240}
            />
            <FieldError errors={err('bookingSpacingMinutes')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="minAdvanceNoticeHours" className="block text-sm font-medium">
              Min advance notice (hours)
            </label>
            <Input
              id="minAdvanceNoticeHours"
              name="minAdvanceNoticeHours"
              type="number"
              defaultValue={config.minAdvanceNoticeHours}
              min={0}
            />
            <FieldError errors={err('minAdvanceNoticeHours')} />
          </div>
        </div>
      </section>

      {/* --- Photos --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Photos
        </h3>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="maxBookingPhotos" className="block text-sm font-medium">
              Max photos per booking
            </label>
            <Input
              id="maxBookingPhotos"
              name="maxBookingPhotos"
              type="number"
              defaultValue={config.maxBookingPhotos}
              min={0}
            />
            <FieldError errors={err('maxBookingPhotos')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="bookingPhotoMaxBytes" className="block text-sm font-medium">
              Max photo size (bytes)
            </label>
            <Input
              id="bookingPhotoMaxBytes"
              name="bookingPhotoMaxBytes"
              type="number"
              defaultValue={config.bookingPhotoMaxBytes}
              min={1}
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              1073741824 = 1 GB
            </p>
            <FieldError errors={err('bookingPhotoMaxBytes')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="photoRetentionDaysAfterResolve" className="block text-sm font-medium">
              Photo retention after resolve (days)
            </label>
            <Input
              id="photoRetentionDaysAfterResolve"
              name="photoRetentionDaysAfterResolve"
              type="number"
              defaultValue={config.photoRetentionDaysAfterResolve}
              min={0}
            />
            <FieldError errors={err('photoRetentionDaysAfterResolve')} />
          </div>
        </div>
      </section>

      {/* --- Landing stats --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Landing stats
        </h3>

        <div className="flex items-center gap-3">
          <Switch
            id="showLandingStats"
            name="showLandingStats"
            defaultChecked={!!config.showLandingStats}
          />
          <label htmlFor="showLandingStats" className="text-sm font-medium cursor-pointer">
            Show landing stats band
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="minReviewsForLandingStats" className="block text-sm font-medium">
              Min reviews to show stats band
            </label>
            <Input
              id="minReviewsForLandingStats"
              name="minReviewsForLandingStats"
              type="number"
              defaultValue={config.minReviewsForLandingStats}
              min={0}
            />
            <FieldError errors={err('minReviewsForLandingStats')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="businessStartDate" className="block text-sm font-medium">
              Business start date
            </label>
            <Input
              id="businessStartDate"
              name="businessStartDate"
              type="date"
              defaultValue={config.businessStartDate ?? ''}
              placeholder="Leave blank to use founding year"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              When set, &quot;Years in Business&quot; is computed from this date (month/day precise).
              Leave blank to fall back to Year Founded.
            </p>
            <FieldError errors={err('businessStartDate')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="statsJobsCompletedOverride" className="block text-sm font-medium">
              Jobs completed (bonus)
            </label>
            <Input
              id="statsJobsCompletedOverride"
              name="statsJobsCompletedOverride"
              type="number"
              defaultValue={config.statsJobsCompletedOverride ?? ''}
              min={0}
              max={100000}
              placeholder="Added to live count. Leave blank for none."
            />
            <FieldError errors={err('statsJobsCompletedOverride')} />
          </div>

          <div className="space-y-2">
            <label htmlFor="statsCustomersServedOverride" className="block text-sm font-medium">
              Customers served (bonus)
            </label>
            <Input
              id="statsCustomersServedOverride"
              name="statsCustomersServedOverride"
              type="number"
              defaultValue={config.statsCustomersServedOverride ?? ''}
              min={0}
              max={100000}
              placeholder="Added to live count. Leave blank for none."
            />
            <FieldError errors={err('statsCustomersServedOverride')} />
          </div>
        </div>
      </section>

      {/* --- Host facts marquee --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Host facts marquee
        </h3>

        <div className="space-y-2">
          <label htmlFor="hostFacts" className="block text-sm font-medium">
            Host facts (one per line)
          </label>
          <textarea
            id="hostFacts"
            name="hostFacts"
            defaultValue={config.hostFacts ?? ''}
            rows={8}
            maxLength={12_000}
            placeholder={'Born and raised in Kansas City\nEagle Scout\nMowing since age 12\nHonor roll student'}
            className="w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            One fact per line. Up to 50 lines, 200 characters each. Order is
            randomized on each page load and items scroll continuously across
            the landing page above the About section.
          </p>
          <FieldError errors={err('hostFacts')} />
        </div>
      </section>

      {/* --- Reviews --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Reviews
        </h3>

        <div className="space-y-2">
          <label htmlFor="minRatingForAutoPublish" className="block text-sm font-medium">
            Min rating for auto-publish (1–5)
          </label>
          <Input
            id="minRatingForAutoPublish"
            name="minRatingForAutoPublish"
            type="number"
            defaultValue={config.minRatingForAutoPublish}
            min={1}
            max={5}
          />
          <FieldError errors={err('minRatingForAutoPublish')} />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="autoPublishTopReviewPhotos"
            name="autoPublishTopReviewPhotos"
            defaultChecked={!!config.autoPublishTopReviewPhotos}
          />
          <label htmlFor="autoPublishTopReviewPhotos" className="text-sm font-medium cursor-pointer">
            Auto-publish top review photos
          </label>
        </div>
      </section>

      {/* ── Save bar ────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur md:left-72">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3">
          <span
            className="text-sm text-[hsl(var(--muted-foreground))]"
            data-testid="settings-saved-indicator"
          >
            {state.ok === true && !isPending && !isDirty ? 'Saved' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={discard}
              disabled={!isDirty || isPending}
              data-testid="settings-discard"
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || isPending}
              data-testid="settings-save"
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
