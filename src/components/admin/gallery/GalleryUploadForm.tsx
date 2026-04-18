'use client';

/**
 * GalleryUploadForm — client form for uploading a new gallery photo.
 *
 * Uses useActionState to call the uploadPhoto server action and shows
 * success / error feedback.
 */

import { useActionState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadPhoto, type PhotoActionResult } from '@/features/site-photos/actions';

const initialState: PhotoActionResult = { ok: true };

export function GalleryUploadForm() {
  const [state, formAction, isPending] = useActionState(uploadPhoto, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    await formAction(formData);
    if (formRef.current) {
      formRef.current.reset();
    }
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
      data-testid="gallery-upload-form"
    >
      <h3 className="font-medium">Upload new photo</h3>

      {state.ok === false && (
        <p className="text-sm text-[hsl(var(--destructive))]" data-testid="gallery-upload-error">
          {state.error}
        </p>
      )}
      {state.ok === true && !isPending && (
        <p className="text-sm text-green-600 hidden" data-testid="gallery-upload-success" />
      )}

      <div className="space-y-2">
        <label htmlFor="gallery-file" className="block text-sm font-medium">
          Image (JPEG, PNG, WebP, HEIC — max 10 MB)
        </label>
        <Input
          id="gallery-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          required
          data-testid="gallery-file-input"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="gallery-caption" className="block text-sm font-medium">
          Caption <span className="text-[hsl(var(--muted-foreground))]">(optional)</span>
        </label>
        <Input
          id="gallery-caption"
          name="caption"
          type="text"
          placeholder="Describe this photo…"
          maxLength={200}
          data-testid="gallery-caption-input"
        />
      </div>

      <Button type="submit" disabled={isPending} data-testid="gallery-upload-button">
        {isPending ? 'Uploading…' : 'Upload photo'}
      </Button>
    </form>
  );
}
