'use client';

/**
 * HeroImageForm — Phase 3C hero image upload/remove section for the Contact tab.
 *
 * Shows the current hero image (if set) as a preview, plus:
 *   - File input + Upload button → calls uploadHeroImage server action
 *   - "Remove current hero" button → calls removeHeroImage server action
 */

import { useActionState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  uploadHeroImage,
  removeHeroImage,
  type HeroActionResult,
} from '@/features/site-config/actions';

const ok: HeroActionResult = { ok: true };

interface HeroImageFormProps {
  heroImagePath: string | null;
}

export function HeroImageForm({ heroImagePath }: HeroImageFormProps) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadHeroImage, ok);
  const [removeState, removeAction, removePending] = useActionState(removeHeroImage, ok);

  return (
    <div className="space-y-4" data-testid="hero-image-section">
      <h3 className="text-base font-medium">Hero image</h3>

      {/* Current image preview */}
      {heroImagePath && (
        <div className="space-y-2">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Current hero image:</p>
          <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-gray-100">
            <Image
              src={heroImagePath}
              alt="Current hero image"
              fill
              className="object-cover object-center"
              sizes="(max-width: 640px) 100vw, 384px"
              data-testid="hero-image-preview"
            />
          </div>
          <form action={removeAction}>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={removePending}
              data-testid="hero-remove-button"
            >
              {removePending ? 'Removing…' : 'Remove current hero'}
            </Button>
          </form>
          {removeState.ok === false && (
            <p className="text-xs text-[hsl(var(--destructive))]">{removeState.error}</p>
          )}
        </div>
      )}

      {!heroImagePath && (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          No hero image set — the landing page will show a gradient placeholder.
        </p>
      )}

      {/* Upload new hero */}
      <form action={uploadAction} className="space-y-3">
        <div className="space-y-2">
          <label htmlFor="hero-file" className="block text-sm font-medium">
            Upload new hero image{' '}
            <span className="text-[hsl(var(--muted-foreground))]">
              (JPEG, PNG, WebP, HEIC — max 10 MB)
            </span>
          </label>
          <Input
            id="hero-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            required
            data-testid="hero-file-input"
          />
        </div>
        {uploadState.ok === false && (
          <p className="text-sm text-[hsl(var(--destructive))]" data-testid="hero-upload-error">
            {uploadState.error}
          </p>
        )}
        {uploadState.ok === true && !uploadPending && heroImagePath && (
          <p className="text-sm text-green-600" data-testid="hero-upload-success" />
        )}
        <Button
          type="submit"
          disabled={uploadPending}
          data-testid="hero-upload-button"
        >
          {uploadPending ? 'Uploading…' : 'Upload hero image'}
        </Button>
      </form>
    </div>
  );
}
