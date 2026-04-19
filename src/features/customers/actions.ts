'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import { customers } from '@/db/schema/customers';
import { normalizeUSPhone } from '@/lib/formatters/phone';

/**
 * Server actions for the customer INDEX book — Phase 10.
 *
 * `updateCustomerNotes(customerId, notes)`:
 *   - Admin-guarded.
 *   - Validates notes ≤ 2 000 characters via Zod.
 *   - Writes to `customers.notes`, bumps `updated_at`.
 *   - Revalidates the detail page cache so the saved value is shown
 *     immediately after the form action resolves.
 *
 * `createCustomerFromAdmin(formData)`:
 *   - Admin-guarded.
 *   - Creates a new customer directly from the admin INDEX book.
 *   - Normalizes phone to E.164 and email to lowercase (mirrors booking-submit).
 *   - Dedup: if a customer already exists with the same normalized phone OR
 *     email, returns the existing customer's id with a "already_exists" kind
 *     rather than inserting a duplicate.
 *   - Returns `{ ok: true, customerId }` on success.
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

// ---------------------------------------------------------------------------
// createCustomerFromAdmin
// ---------------------------------------------------------------------------

const CreateCustomerSchema = z.object({
  name: z.string().trim().min(1, { message: 'Name is required.' }).max(120, { message: 'Name must be 120 characters or fewer.' }),
  phone: z.string().trim().min(1, { message: 'Phone is required.' }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Enter a valid email address.' })
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(2000, { message: 'Notes must be 2 000 characters or fewer.' }).optional(),
});

export type CreateCustomerResult =
  | { ok: true; customerId: number }
  | { ok: false; kind: 'already_exists'; customerId: number; message: string }
  | { ok: false; kind: 'validation'; fieldErrors: Record<string, string> }
  | { ok: false; kind: 'internal'; message: string };

export async function createCustomerFromAdmin(
  formData: FormData,
): Promise<CreateCustomerResult> {
  const session = await auth();
  if (!session) {
    return { ok: false, kind: 'internal', message: 'unauthenticated' };
  }

  const rawPhone = String(formData.get('phone') ?? '').trim();
  const rawEmail = String(formData.get('email') ?? '').trim();

  const parsed = CreateCustomerSchema.safeParse({
    name: formData.get('name'),
    phone: rawPhone,
    email: rawEmail || undefined,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, kind: 'validation', fieldErrors };
  }

  const { name, email, notes } = parsed.data;

  // Normalize phone to E.164 — phone is required per schema.
  const phone = normalizeUSPhone(rawPhone);
  if (!phone) {
    return {
      ok: false,
      kind: 'validation',
      fieldErrors: { phone: 'Enter a valid US phone number.' },
    };
  }

  const emailLower = email && email.length > 0 ? email.toLowerCase() : null;

  const db = getDb();

  // Dedup check — mirror booking-submit precedence: phone first, then email.
  const conditions = [eq(customers.phone, phone)];
  if (emailLower) {
    conditions.push(sql`lower(${customers.email}) = ${emailLower}`);
  }

  const existing = db
    .select({ id: customers.id })
    .from(customers)
    .where(or(...conditions))
    .limit(1)
    .all()[0];

  if (existing) {
    return {
      ok: false,
      kind: 'already_exists',
      customerId: existing.id,
      message: 'A customer with that phone or email already exists.',
    };
  }

  const now = new Date().toISOString();
  let customerId: number;
  try {
    const inserted = db
      .insert(customers)
      .values({
        name,
        phone,
        email: emailLower,
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: customers.id })
      .all();
    customerId = inserted[0].id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(msg)) {
      // Race — another insert won; surface as already_exists without a customerId
      // (we don't know which row). Return a generic message.
      return {
        ok: false,
        kind: 'internal',
        message: 'A customer with that phone or email was just created by another request. Please search for them.',
      };
    }
    return { ok: false, kind: 'internal', message: msg };
  }

  try {
    revalidatePath('/admin/index-book');
  } catch {
    // best-effort
  }

  return { ok: true, customerId };
}
