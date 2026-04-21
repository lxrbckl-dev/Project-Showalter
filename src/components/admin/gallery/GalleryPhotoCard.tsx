'use client';

/**
 * GalleryPhotoCard — admin gallery thumbnail.
 *
 * The card is just the image (with an "Archived" overlay when applicable).
 * Clicking the image opens a modal `<dialog>` containing the caption editor
 * and archive/restore controls so admins get a roomy editing surface
 * instead of a cramped inline form under each thumbnail.
 */

import { useActionState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  updatePhotoCaption,
  archivePhoto,
  restorePhoto,
  type PhotoActionResult,
} from '@/features/site-photos/actions';
import type { SitePhotoRow } from '@/db/schema/site-photos';

const ok: PhotoActionResult = { ok: true };

interface GalleryPhotoCardProps {
  photo: SitePhotoRow;
}

export function GalleryPhotoCard({ photo }: GalleryPhotoCardProps) {
  const [captionState, captionAction, captionPending] = useActionState(updatePhotoCaption, ok);
  const [archiveState, archiveAction, archivePending] = useActionState(archivePhoto, ok);
  const [restoreState, restoreAction, restorePending] = useActionState(restorePhoto, ok);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const isArchived = photo.active === 0;

  // Auto-close after a successful archive/restore — once the photo flips
  // status, leaving the dialog open shows stale state. Caption saves leave
  // the dialog open so admins can keep tweaking.
  useEffect(() => {
    if (!archivePending && archiveState.ok && archiveState !== ok) {
      dialogRef.current?.close();
    }
  }, [archiveState, archivePending]);

  useEffect(() => {
    if (!restorePending && restoreState.ok && restoreState !== ok) {
      dialogRef.current?.close();
    }
  }, [restoreState, restorePending]);

  function openDialog(): void {
    dialogRef.current?.showModal();
  }

  function closeDialog(): void {
    dialogRef.current?.close();
  }

  return (
    <>
      <div
        className={`overflow-hidden rounded-lg border bg-[hsl(var(--card))] ${
          isArchived ? 'border-dashed opacity-60' : 'border-[hsl(var(--border))]'
        }`}
        data-testid={`gallery-photo-card-${photo.id}`}
      >
        <button
          type="button"
          onClick={openDialog}
          aria-label={`Edit photo ${photo.caption ?? photo.id}`}
          className="group relative block aspect-square w-full bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid={`gallery-photo-open-${photo.id}`}
        >
          <Image
            src={`/uploads/${photo.filePath}`}
            alt={photo.caption ?? 'Gallery photo'}
            fill
            className="object-cover object-center transition-opacity group-hover:opacity-90"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          {isArchived && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-xs font-semibold uppercase tracking-wide text-white">
                Archived
              </span>
            </div>
          )}
        </button>

        {/* Caption preview under the thumbnail (read-only). Empty state
          uses muted "Add a caption…" hint so the row stays a stable height. */}
        <div className="px-3 py-2">
          <p
            className={`truncate text-xs ${
              photo.caption
                ? 'text-[hsl(var(--foreground))]'
                : 'italic text-[hsl(var(--muted-foreground))]'
            }`}
            data-testid={`gallery-caption-display-${photo.id}`}
          >
            {photo.caption || 'Add a caption…'}
          </p>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        data-testid={`gallery-photo-dialog-${photo.id}`}
        onClick={(e) => {
          // Backdrop click closes — clicks on inner content are stopped by
          // the explicit content wrapper below.
          if (e.target === dialogRef.current) closeDialog();
        }}
        className="fixed top-1/2 left-1/2 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 text-[hsl(var(--foreground))] shadow-xl backdrop:bg-black/40"
      >
        <div className="space-y-4 p-4">
          {/* Larger image preview at the top of the dialog so admins can
            see what they're labeling. */}
          <div className="relative aspect-video overflow-hidden rounded-md bg-gray-100">
            <Image
              src={`/uploads/${photo.filePath}`}
              alt={photo.caption ?? 'Gallery photo'}
              fill
              className="object-cover object-center"
              sizes="(max-width: 768px) 90vw, 28rem"
            />
          </div>

          {/* Caption editor */}
          <form action={captionAction} className="space-y-2">
            <input type="hidden" name="id" value={photo.id} />
            <label
              htmlFor={`gallery-caption-input-${photo.id}`}
              className="block text-sm font-medium"
            >
              Caption
            </label>
            <Textarea
              id={`gallery-caption-input-${photo.id}`}
              name="caption"
              defaultValue={photo.caption ?? ''}
              placeholder="Caption…"
              maxLength={200}
              rows={4}
              className="resize-y min-h-24"
              data-testid={`gallery-caption-field-${photo.id}`}
            />
            {captionState.ok === false && (
              <p className="text-xs text-[hsl(var(--destructive))]">
                {captionState.error}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={captionPending}
              className="w-full"
              data-testid={`gallery-caption-save-${photo.id}`}
            >
              {captionPending ? 'Saving…' : 'Save caption'}
            </Button>
          </form>

          {/* Archive / restore */}
          {isArchived ? (
            <form action={restoreAction}>
              <input type="hidden" name="id" value={photo.id} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={restorePending}
                data-testid={`gallery-restore-${photo.id}`}
              >
                {restorePending ? 'Restoring…' : 'Restore photo'}
              </Button>
              {restoreState.ok === false && (
                <p className="mt-1 text-xs text-[hsl(var(--destructive))]">
                  {restoreState.error}
                </p>
              )}
            </form>
          ) : (
            <form action={archiveAction}>
              <input type="hidden" name="id" value={photo.id} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-full text-[hsl(var(--muted-foreground))]"
                disabled={archivePending}
                data-testid={`gallery-archive-${photo.id}`}
              >
                {archivePending ? 'Archiving…' : 'Archive photo'}
              </Button>
              {archiveState.ok === false && (
                <p className="mt-1 text-xs text-[hsl(var(--destructive))]">
                  {archiveState.error}
                </p>
              )}
            </form>
          )}

          <button
            type="button"
            onClick={closeDialog}
            data-testid={`gallery-dialog-close-${photo.id}`}
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))]"
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
