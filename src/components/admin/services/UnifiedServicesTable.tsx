'use client';

/**
 * UnifiedServicesTable — merges ServicesTable and SortableServicesList into one.
 *
 * Active rows:
 *   - Rendered inside DndContext + SortableContext so they can be dragged.
 *   - Drag handle (GripVertical) in the first column.
 *   - Edit button → /admin/services/[id]/edit
 *   - Archive button → calls archiveService
 *
 * Archived rows:
 *   - Rendered in the same <table> below the active rows, outside DndContext.
 *   - No drag handle (cell is empty).
 *   - Visually dimmed (opacity-60) with a "Archived" divider row above.
 *   - Restore button → calls restoreService
 *
 * The DndContext carries id="admin-services-sortable" — this is the SWE-45 fix
 * that prevents the DndDescribedBy-N hydration mismatch. DO NOT remove it.
 */

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
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
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { archiveService, restoreService, reorderServices } from '@/features/services/actions';
import type { ServiceRow } from '@/db/schema/services';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(cents: number | null, suffix: string): string {
  if (cents === null) return 'Contact for pricing';
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}${suffix}`;
}

// ---------------------------------------------------------------------------
// SortableRow — a draggable active-service row inside the table
// ---------------------------------------------------------------------------

interface SortableRowProps {
  service: ServiceRow;
}

function SortableRow({ service }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
  });

  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={rowStyle}
      className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.4)]"
      data-testid={`service-row-${service.id}`}
    >
      {/* Drag handle */}
      <td className="w-8 px-2 py-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] active:cursor-grabbing"
          aria-label={`Drag to reorder ${service.name}`}
          data-testid="drag-handle"
        >
          <GripVertical size={16} />
        </button>
      </td>

      <td className="px-4 py-3 font-medium" data-testid="service-name">
        {service.name}
      </td>

      <td className="max-w-xs px-4 py-3 text-[hsl(var(--muted-foreground))]">
        <span className="line-clamp-2">{service.description}</span>
      </td>

      <td className="px-4 py-3 tabular-nums" data-testid="service-price">
        {formatPrice(service.priceCents, service.priceSuffix)}
      </td>

      <td className="px-4 py-3">
        <Badge variant="default" data-testid="service-status">
          Active
        </Badge>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/services/${service.id}/edit`}>
            <Button size="sm" variant="outline" data-testid="edit-button">
              Edit
            </Button>
          </Link>
          <form action={archiveService.bind(null, service.id)}>
            <Button
              size="sm"
              variant="outline"
              type="submit"
              data-testid="archive-button"
            >
              Hide
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// ArchivedRow — a non-draggable archived-service row inside the table
// ---------------------------------------------------------------------------

interface ArchivedRowProps {
  service: ServiceRow;
}

function ArchivedRow({ service }: ArchivedRowProps) {
  return (
    <tr
      className="border-b border-[hsl(var(--border))] last:border-0 opacity-60 hover:bg-[hsl(var(--muted)/0.4)]"
      data-testid={`service-row-${service.id}`}
    >
      {/* Empty drag-handle cell */}
      <td className="w-8 px-2 py-3" />

      <td className="px-4 py-3 font-medium" data-testid="service-name">
        {service.name}
      </td>

      <td className="max-w-xs px-4 py-3 text-[hsl(var(--muted-foreground))]">
        <span className="line-clamp-2">{service.description}</span>
      </td>

      <td className="px-4 py-3 tabular-nums" data-testid="service-price">
        {formatPrice(service.priceCents, service.priceSuffix)}
      </td>

      <td className="px-4 py-3">
        <Badge variant="secondary" data-testid="service-status">
          Hidden
        </Badge>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/services/${service.id}/edit`}>
            <Button size="sm" variant="outline" data-testid="edit-button">
              Edit
            </Button>
          </Link>
          <form action={restoreService.bind(null, service.id)}>
            <Button
              size="sm"
              variant="outline"
              type="submit"
              data-testid="restore-button"
            >
              Show
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// UnifiedServicesTable — the main export
// ---------------------------------------------------------------------------

interface UnifiedServicesTableProps {
  services: ServiceRow[];
}

export function UnifiedServicesTable({ services: initialServices }: UnifiedServicesTableProps) {
  const [activeItems, setActiveItems] = useState<ServiceRow[]>(
    initialServices.filter((s) => s.active === 1),
  );
  const archivedItems = initialServices.filter((s) => s.active === 0);

  // Re-sync from props after server-action mutations (Show/Hide/reorder) so
  // the optimistic-state local copy doesn't drift from the source of truth.
  // Without this, clicking Show on an archived row removes it from the
  // archived list (derived from props) but never adds it to activeItems
  // (which only initializes once), making the row vanish until refresh.
  useEffect(() => {
    setActiveItems(initialServices.filter((s) => s.active === 1));
  }, [initialServices]);

  const [isPending, startTransition] = useTransition();
  const [reorderError, setReorderError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setActiveItems((current) => {
      const oldIndex = current.findIndex((s) => s.id === active.id);
      const newIndex = current.findIndex((s) => s.id === over.id);
      const reordered = arrayMove(current, oldIndex, newIndex);

      startTransition(async () => {
        try {
          await reorderServices(reordered.map((s) => s.id));
        } catch {
          setReorderError('Failed to save reorder. Please refresh and try again.');
        }
      });

      return reordered;
    });
  }

  if (activeItems.length === 0 && archivedItems.length === 0) {
    return (
      <div className="rounded-md border border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        No services yet. Create your first service above.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reorderError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {reorderError}
        </div>
      )}
      {isPending && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Saving order…</p>
      )}

      <div className="rounded-md border border-[hsl(var(--border))]">
        {/* DndContext wraps the entire table so its accessibility <div> sits
            outside <table>, avoiding the invalid div-inside-table nesting. */}
        <DndContext
          id="admin-services-sortable"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeItems.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <table className="w-full text-sm" data-testid="unified-services-table">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  {/* drag-handle column — no heading */}
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-left font-medium">Price</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>

              {/* Active rows — inside SortableContext */}
              <tbody data-testid="sortable-services-list">
                {activeItems.map((service) => (
                  <SortableRow key={service.id} service={service} />
                ))}
              </tbody>

              {/* Hidden rows — outside SortableContext items list; plain tbody */}
              {archivedItems.length > 0 && (
                <>
                  <tbody>
                    <tr className="border-t border-[hsl(var(--border))]">
                      <td
                        colSpan={6}
                        className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.5)]"
                      >
                        Hidden
                      </td>
                    </tr>
                  </tbody>
                  <tbody>
                    {archivedItems.map((service) => (
                      <ArchivedRow key={service.id} service={service} />
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
