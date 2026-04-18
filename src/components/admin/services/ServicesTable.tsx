/**
 * ServicesTable — server component that renders the admin services list.
 *
 * Displays columns: Name, Description, Price, Suffix, Sort Order, Active, Actions.
 * Active services are shown first (sorted by sort_order), then inactive.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { archiveService, restoreService } from '@/features/services/actions';
import type { ServiceRow } from '@/db/schema/services';

interface ServicesTableProps {
  services: ServiceRow[];
}

function formatPrice(cents: number | null, suffix: string): string {
  if (cents === null) return 'Contact for pricing';
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}${suffix}`;
}

export function ServicesTable({ services }: ServicesTableProps) {
  if (services.length === 0) {
    return (
      <div className="rounded-md border border-[hsl(var(--border))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        No services yet. Create your first service above.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[hsl(var(--border))]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Description</th>
            <th className="px-4 py-3 text-left font-medium">Price</th>
            <th className="px-4 py-3 text-left font-medium">Sort</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr
              key={service.id}
              className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--muted)/0.4)]"
              data-testid={`service-row-${service.id}`}
            >
              <td className="px-4 py-3 font-medium" data-testid="service-name">
                {service.name}
              </td>
              <td className="max-w-xs px-4 py-3 text-[hsl(var(--muted-foreground))]">
                <span className="line-clamp-2">{service.description}</span>
              </td>
              <td className="px-4 py-3 tabular-nums" data-testid="service-price">
                {formatPrice(service.priceCents, service.priceSuffix)}
              </td>
              <td className="px-4 py-3 tabular-nums" data-testid="service-sort-order">
                {service.sortOrder}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={service.active === 1 ? 'default' : 'secondary'}
                  data-testid="service-status"
                >
                  {service.active === 1 ? 'Active' : 'Archived'}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link href={`/admin/services/${service.id}/edit`}>
                    <Button size="sm" variant="outline" data-testid="edit-button">
                      Edit
                    </Button>
                  </Link>
                  {service.active === 1 ? (
                    <form
                      action={async () => {
                        'use server';
                        await archiveService(service.id);
                      }}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        type="submit"
                        data-testid="archive-button"
                      >
                        Archive
                      </Button>
                    </form>
                  ) : (
                    <form
                      action={async () => {
                        'use server';
                        await restoreService(service.id);
                      }}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        type="submit"
                        data-testid="restore-button"
                      >
                        Restore
                      </Button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
