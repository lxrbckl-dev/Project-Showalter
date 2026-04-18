'use server';

/**
 * services/actions.ts — Next.js server actions for the services domain.
 *
 * Principles:
 *   - Never hard-delete. Archive via active=0 only.
 *   - Revalidate `/` after every write so the public Services section updates.
 *   - All mutations are Zod-validated before touching the DB.
 */

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { services } from '@/db/schema/services';
import { ServiceSchema, type ServiceFormValues } from './validate';

/**
 * createService — validates and inserts a new service row.
 *
 * @throws ZodError if validation fails (should be caught by the caller).
 */
export async function createService(data: ServiceFormValues): Promise<{ id: number }> {
  const parsed = ServiceSchema.parse(data);
  const db = getDb();

  const result = db
    .insert(services)
    .values({
      name: parsed.name,
      description: parsed.description,
      priceCents: parsed.price_cents,
      priceSuffix: parsed.price_suffix,
      sortOrder: parsed.sort_order,
      active: 1,
    })
    .returning({ id: services.id })
    .get();

  revalidatePath('/');
  revalidatePath('/admin/services');
  return { id: result.id };
}

/**
 * updateService — validates and updates an existing service row.
 */
export async function updateService(id: number, data: ServiceFormValues): Promise<void> {
  const parsed = ServiceSchema.parse(data);
  const db = getDb();

  db.update(services)
    .set({
      name: parsed.name,
      description: parsed.description,
      priceCents: parsed.price_cents,
      priceSuffix: parsed.price_suffix,
      sortOrder: parsed.sort_order,
    })
    .where(eq(services.id, id))
    .run();

  revalidatePath('/');
  revalidatePath('/admin/services');
}

/**
 * archiveService — sets active=0 (soft-archive). Never hard-deletes.
 */
export async function archiveService(id: number): Promise<void> {
  const db = getDb();
  db.update(services).set({ active: 0 }).where(eq(services.id, id)).run();

  revalidatePath('/');
  revalidatePath('/admin/services');
}

/**
 * restoreService — sets active=1.
 */
export async function restoreService(id: number): Promise<void> {
  const db = getDb();
  db.update(services).set({ active: 1 }).where(eq(services.id, id)).run();

  revalidatePath('/');
  revalidatePath('/admin/services');
}

/**
 * reorderServices — bulk-updates sort_order based on the provided ordered list of IDs.
 *
 * Assigns sort_order = index + 1 for each id in the array.
 * Uses a SQLite transaction for atomicity.
 */
export async function reorderServices(orderedIds: number[]): Promise<void> {
  const db = getDb();

  // Run all updates inside a single transaction.
  const updateStatements = orderedIds.map((id, index) =>
    db
      .update(services)
      .set({ sortOrder: index + 1 })
      .where(eq(services.id, id)),
  );

  // better-sqlite3 transactions are synchronous.
  const { getSqlite } = await import('@/db');
  const sqlite = getSqlite();
  const txn = sqlite.transaction(() => {
    for (const stmt of updateStatements) {
      stmt.run();
    }
  });
  txn();

  revalidatePath('/');
  revalidatePath('/admin/services');
}
