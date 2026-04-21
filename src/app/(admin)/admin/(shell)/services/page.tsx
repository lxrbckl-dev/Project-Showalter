/**
 * /admin/services — list page for the services catalog.
 *
 * Server component. Fetches all services (active first) and renders:
 *   - Header + "New service" link
 *   - UnifiedServicesTable (drag-to-reorder + edit/archive in one place)
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { UnifiedServicesTable } from '@/components/admin/services/UnifiedServicesTable';
import { getAllServices } from '@/features/services/queries';

export default function AdminServicesPage() {
  const services = getAllServices();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Manage the services shown on the public site. Drag active rows to reorder. Active
            services appear first.
          </p>
        </div>
        <Link href="/admin/services/new" className="sm:shrink-0">
          <Button data-testid="new-service-button" className="w-full sm:w-auto">
            New service
          </Button>
        </Link>
      </div>

      <UnifiedServicesTable services={services} />
    </div>
  );
}
