'use client';

/**
 * SortableServicesList — drag-to-reorder client component using @dnd-kit/sortable.
 *
 * Only active services participate in the drag order. After a successful
 * drop, calls `reorderServices` server action with the new ordered IDs.
 */

import { useState, useTransition } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderServices } from '@/features/services/actions';
import type { ServiceRow } from '@/db/schema/services';

interface SortableItemProps {
  service: ServiceRow;
}

function SortableItem({ service }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
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
      className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 shadow-sm"
      data-testid={`sortable-item-${service.id}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        aria-label={`Drag to reorder ${service.name}`}
        data-testid="drag-handle"
      >
        {/* Hamburger / drag handle icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect y="3" width="16" height="2" rx="1" />
          <rect y="7" width="16" height="2" rx="1" />
          <rect y="11" width="16" height="2" rx="1" />
        </svg>
      </button>
      <span className="flex-1 font-medium" data-testid="sortable-service-name">
        {service.name}
      </span>
      <span className="text-sm text-[hsl(var(--muted-foreground))]">#{service.sortOrder}</span>
    </div>
  );
}

interface SortableServicesListProps {
  services: ServiceRow[];
}

export function SortableServicesList({ services: initialServices }: SortableServicesListProps) {
  // Only active services are shown for reorder
  const active = initialServices.filter((s) => s.active === 1);
  const [items, setItems] = useState<ServiceRow[]>(active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((current) => {
      const oldIndex = current.findIndex((s) => s.id === active.id);
      const newIndex = current.findIndex((s) => s.id === over.id);
      const reordered = arrayMove(current, oldIndex, newIndex);

      // Optimistically persist
      startTransition(async () => {
        try {
          await reorderServices(reordered.map((s) => s.id));
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
        No active services to reorder.
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
      <DndContext id="admin-services-sortable" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2" data-testid="sortable-services-list">
            {items.map((service) => (
              <SortableItem key={service.id} service={service} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
