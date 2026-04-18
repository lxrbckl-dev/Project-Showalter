'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import { customers } from '@/db/schema/customers';

/**
 * Server actions for the customer INDEX book — Phase 10.
 *
 * `updateCustomerNotes(customerId, notes)`:
 *   - Admin-guarded.
 *   - Validates notes ≤ 2 000 characters via Zod.
 *   - Writes to `customers.notes`, bumps `updated_at`.
 *   - Revalidates the detail page cache so the saved value is shown
 *     immediately after the form action resolves.
 */

const NotesSchema = z.object({
  notes: z
    .string()
    .max(2000, { message: 'Notes must be 2 000 characters or fewer.' }),
});

export type UpdateNotesResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCustomerNotes(
  customerId: number,
  notes: string,
): Promise<UpdateNotesResult> {
  const session = await auth();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const parsed = NotesSchema.safeParse({ notes });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid notes.' };
  }

  const db = getDb();
  const row = db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)
    .all()[0];
  if (!row) return { ok: false, error: 'Customer not found.' };

  const now = new Date().toISOString();
  db.update(customers)
    .set({ notes: parsed.data.notes, updatedAt: now })
    .where(eq(customers.id, customerId))
    .run();

  try {
    revalidatePath(`/admin/index-book/${customerId}`);
  } catch {
    // ignore — revalidation is best-effort
  }

  return { ok: true };
}
