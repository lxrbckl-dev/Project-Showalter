/**
 * /admin/services/new — create a new service.
 *
 * Server component shell; delegates form rendering to ServiceForm (client component).
 * The submit action is a server action defined inline here.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ServiceForm } from '@/components/admin/services/ServiceForm';
import { createService } from '@/features/services/actions';
import type { ServiceFormValues } from '@/features/services/validate';

export default function NewServicePage() {
  async function handleCreate(data: ServiceFormValues) {
    'use server';
    try {
      await createService(data);
    } catch {
      return { error: 'Failed to create service. Please try again.' };
    }
    redirect('/admin/services');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/services">
          <Button variant="outline" size="sm">
            ← Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New service</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Add a new service to the public catalog.
          </p>
        </div>
      </div>

      <ServiceForm onSubmit={handleCreate} submitLabel="Create service" />
    </div>
  );
}
