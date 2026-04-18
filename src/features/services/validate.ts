/**
 * services/validate.ts — Zod schemas for the services domain.
 *
 * Used by both server actions (validation) and client components (form type inference).
 * Keep this file import-free of server-only modules so the client can import it.
 */

import { z } from 'zod';

export const ServiceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or fewer'),
  price_cents: z
    .union([z.number().int().min(0, 'Price must be 0 or more'), z.null()])
    .nullable()
    .default(null),
  price_suffix: z.string().max(4, 'Suffix must be 4 characters or fewer').default(''),
  sort_order: z.number().int().default(0),
});

export type ServiceFormValues = z.infer<typeof ServiceSchema>;
