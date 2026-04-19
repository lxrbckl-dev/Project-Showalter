'use client';

/**
 * SortableGalleryList — drag-to-reorder active gallery photos using @dnd-kit/sortable.
 *
 * Mirrors the pattern from SortableServicesList. After a drag, calls
 * reorderPhotos() server action with the new ID order.
 */

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderPhotos } from '@/features/site-photos/actions';
import type { SitePhotoRow } from '@/db/schema/site-photos';

interface SortablePhotoItemProps {
  photo: SitePhotoRow;
}

function SortablePhotoItem({ photo }: SortablePhotoItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-gray-100 cursor-grab"
      data-testid={`sortable-photo-${photo.id}`}
    >
      <Image
        src={`/uploads/${photo.filePath}`}
        alt={photo.caption ?? 'Gallery photo'}
        fill
        className="object-cover object-center"
        sizes="(max-width: 768px) 33vw, 20vw"
      />
      {/* Drag handle overlay */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/20 flex items-center justify-center transition-opacity"
        aria-label={`Drag to reorder photo ${photo.id}`}
        data-testid="drag-handle"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="white"
          className="drop-shadow"
        >
          <path d="M8 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm8-15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
        </svg>
      </button>
      {photo.caption && (
        <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-xs text-white truncate">
          {photo.caption}
        </p>
      )}
    </div>
  );
}

interface SortableGalleryListProps {
  photos: SitePhotoRow[];
}

export function SortableGalleryList({ photos: initialPhotos }: SortableGalleryListProps) {
  const active = initialPhotos.filter((p) => p.active === 1);
  const [items, setItems] = useState<SitePhotoRow[]>(active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;

    setItems((current) => {
      const oldIndex = current.findIndex((p) => p.id === dragActive.id);
      const newIndex = current.findIndex((p) => p.id === over.id);
      const reordered = arrayMove(current, oldIndex, newIndex);

      startTransition(async () => {
        try {
          await reorderPhotos(reordered.map((p) => p.id));
        } catch {
          setError('Failed to save reorder. Please refresh and try again.');
        }
      });

      return reordered;
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        No active photos to reorder. Upload photos above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {isPending && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Saving order…</p>
      )}
      <DndContext
        id="admin-gallery-sortable"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div
            className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"
            data-testid="sortable-gallery-list"
          >
            {items.map((photo) => (
              <SortablePhotoItem key={photo.id} photo={photo} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
