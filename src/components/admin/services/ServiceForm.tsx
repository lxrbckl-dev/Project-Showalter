'use client';

/**
 * ServiceForm — shared client-side form for creating and editing services.
 *
 * Receives an optional `defaultValues` for the edit flow.
 * Calls `onSubmit` (a server action wrapper) on submit.
 */

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ServiceFormValues } from '@/features/services/validate';

interface ServiceFormProps {
  defaultValues?: Partial<ServiceFormValues>;
  /** Called with parsed form data. Should return an error string or null. */
  onSubmit: (data: ServiceFormValues) => Promise<{ error?: string } | void>;
  submitLabel?: string;
}

export function ServiceForm({ defaultValues, onSubmit, submitLabel = 'Save' }: ServiceFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);

    const priceRaw = fd.get('price_cents') as string;
    let price_cents: number | null = null;
    if (priceRaw.trim() !== '') {
      const parsed = Number(priceRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setError('Price must be a whole number of cents (0 or more), or left blank.');
        return;
      }
      price_cents = parsed;
    }

    const data: ServiceFormValues = {
      name: (fd.get('name') as string).trim(),
      description: (fd.get('description') as string).trim(),
      price_cents,
      price_suffix: (fd.get('price_suffix') as string).trim(),
      sort_order: Number(fd.get('sort_order') ?? 0),
    };

    // Basic client-side length checks (mirrors Zod)
    if (!data.name) {
      setError('Name is required.');
      return;
    }
    if (data.name.length > 100) {
      setError('Name must be 100 characters or fewer.');
      return;
    }
    if (!data.description) {
      setError('Description is required.');
      return;
    }
    if (data.description.length > 500) {
      setError('Description must be 500 characters or fewer.');
      return;
    }
    if (data.price_suffix.length > 4) {
      setError('Suffix must be 4 characters or fewer.');
      return;
    }

    startTransition(async () => {
      const result = await onSubmit(data);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      }
    });
  }

  const priceCentsDefault =
    defaultValues?.price_cents !== undefined && defaultValues.price_cents !== null
      ? String(defaultValues.price_cents)
      : '';

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl" data-testid="service-form">
      {error && (
        <div
          className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          data-testid="form-error"
        >
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultValues?.name ?? ''}
          placeholder="Mowing"
          maxLength={100}
          required
          data-testid="input-name"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Max 100 characters.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ''}
          placeholder="Mow, weedeat, and edge."
          maxLength={500}
          required
          rows={3}
          className="flex w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          data-testid="input-description"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Max 500 characters.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="price_cents" className="block text-sm font-medium">
            Price (cents)
          </label>
          <Input
            id="price_cents"
            name="price_cents"
            type="number"
            min={0}
            step={1}
            defaultValue={priceCentsDefault}
            placeholder="Leave blank for 'Contact for pricing'"
            data-testid="input-price-cents"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            In cents. Blank = &ldquo;Contact for pricing&rdquo;.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="price_suffix" className="block text-sm font-medium">
            Price Suffix
          </label>
          <Input
            id="price_suffix"
            name="price_suffix"
            maxLength={4}
            defaultValue={defaultValues?.price_suffix ?? ''}
            placeholder="+ or /hr"
            data-testid="input-price-suffix"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Up to 4 chars (e.g. &ldquo;+&rdquo;, &ldquo;/hr&rdquo;).
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="sort_order" className="block text-sm font-medium">
          Sort Order
        </label>
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          step={1}
          defaultValue={String(defaultValues?.sort_order ?? 0)}
          data-testid="input-sort-order"
        />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Lower numbers appear first on the public site.
        </p>
      </div>

      <Button type="submit" disabled={isPending} data-testid="submit-button">
        {isPending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
