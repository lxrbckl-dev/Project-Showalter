'use client';

/**
 * GalleryPhotoCard — individual card in the admin gallery grid.
 *
 * Shows:
 *  - Thumbnail (Next.js Image)
 *  - Caption editor (inline input + save)
 *  - Archive / restore button
 */

import { useActionState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  const isArchived = photo.active === 0;

  return (
    <div
      className={`rounded-lg border bg-[hsl(var(--card))] overflow-hidden ${
        isArchived ? 'opacity-60 border-dashed' : 'border-[hsl(var(--border))]'
      }`}
      data-testid={`gallery-photo-card-${photo.id}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-gray-100">
        <Image
          src={`/uploads/${photo.filePath}`}
          alt={photo.caption ?? 'Gallery photo'}
          fill
          className="object-cover object-center"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {isArchived && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-xs font-semibold uppercase tracking-wide text-white">
              Archived
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-3 space-y-3">
        {/* Caption editor */}
        <form action={captionAction} className="flex gap-2">
          <input type="hidden" name="id" value={photo.id} />
          <Input
            name="caption"
            defaultValue={photo.caption ?? ''}
            placeholder="Caption…"
            maxLength={200}
            className="text-xs"
            data-testid={`gallery-caption-field-${photo.id}`}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={captionPending}
            data-testid={`gallery-caption-save-${photo.id}`}
          >
            {captionPending ? '…' : 'Save'}
          </Button>
        </form>
        {captionState.ok === false && (
          <p className="text-xs text-[hsl(var(--destructive))]">{captionState.error}</p>
        )}

        {/* Archive / restore */}
        {isArchived ? (
          <form action={restoreAction}>
            <input type="hidden" name="id" value={photo.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="w-full text-xs"
              disabled={restorePending}
              data-testid={`gallery-restore-${photo.id}`}
            >
              {restorePending ? 'Restoring…' : 'Restore'}
            </Button>
          </form>
        ) : (
          <form action={archiveAction}>
            <input type="hidden" name="id" value={photo.id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="w-full text-xs text-[hsl(var(--muted-foreground))]"
              disabled={archivePending}
              data-testid={`gallery-archive-${photo.id}`}
            >
              {archivePending ? 'Archiving…' : 'Archive'}
            </Button>
          </form>
        )}
        {archiveState.ok === false && (
          <p className="text-xs text-[hsl(var(--destructive))]">{archiveState.error}</p>
        )}
        {restoreState.ok === false && (
          <p className="text-xs text-[hsl(var(--destructive))]">{restoreState.error}</p>
        )}
      </div>
    </div>
  );
}
