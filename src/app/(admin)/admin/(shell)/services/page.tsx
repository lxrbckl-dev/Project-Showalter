/**
 * /admin/services — list page for the services catalog.
 *
 * Server component. Fetches all services (active first) and renders:
 *   - Header + "New service" link
 *   - ServicesTable (view/edit/archive/restore)
 *   - SortableServicesList (drag-to-reorder active services)
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ServicesTable } from '@/components/admin/services/ServicesTable';
import { SortableServicesList } from '@/components/admin/services/SortableServicesList';
import { getAllServices } from '@/features/services/queries';

export default function AdminServicesPage() {
  const services = getAllServices();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage the services shown on the public site. Active services appear first.
          </p>
        </div>
        <Link href="/admin/services/new">
          <Button data-testid="new-service-button">New service</Button>
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">All services</h2>
        <ServicesTable services={services} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">Reorder active services</h2>
        <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
          Drag rows to change display order on the public site.
        </p>
        <SortableServicesList services={services} />
      </section>
    </div>
  );
}
