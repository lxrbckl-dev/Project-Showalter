/**
 * /admin/services/[id]/edit — edit an existing service.
 *
 * Server component. Fetches the service by id, renders ServiceForm pre-populated.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ServiceForm } from '@/components/admin/services/ServiceForm';
import { updateService } from '@/features/services/actions';
import { getServiceById } from '@/features/services/queries';
import type { ServiceFormValues } from '@/features/services/validate';

interface EditServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const service = getServiceById(id);
  if (!service) notFound();

  async function handleUpdate(data: ServiceFormValues) {
    'use server';
    try {
      await updateService(id, data);
    } catch {
      return { error: 'Failed to update service. Please try again.' };
    }
    redirect('/admin/services');
  }

  const defaultValues: Partial<ServiceFormValues> = {
    name: service.name,
    description: service.description,
    price_cents: service.priceCents,
    price_suffix: service.priceSuffix,
    sort_order: service.sortOrder,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/services">
          <Button variant="outline" size="sm">
            ← Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit service</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Update &ldquo;{service.name}&rdquo;.
          </p>
        </div>
      </div>

      <ServiceForm
        defaultValues={defaultValues}
        onSubmit={handleUpdate}
        submitLabel="Save changes"
      />
    </div>
  );
}
