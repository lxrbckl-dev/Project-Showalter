'use client';

import { useActionState } from 'react';
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

  return (
    <form action={formAction} className="space-y-8 max-w-xl">
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
            Shown on the landing page hero, page titles, and social-share cards.
            1–60 characters.
          </p>
          <FieldError errors={err('siteTitle')} />
        </div>

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
      </section>

      {/* --- Booking knobs --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Booking
        </h3>

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
      </section>

      {/* --- Photos --- */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Photos
        </h3>

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
            Default 10485760 = 10 MB
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {state.ok === true && !isPending && (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Saved</span>
        )}
      </div>
    </form>
  );
}
