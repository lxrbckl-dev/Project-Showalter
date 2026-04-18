/**
 * services/queries.ts — read-side DB queries for the services domain.
 *
 * All writes go through actions.ts. These functions are synchronous
 * (better-sqlite3 is synchronous) and safe to call from server components.
 */

import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { services, type ServiceRow } from '@/db/schema/services';

/**
 * Returns all services ordered by: active DESC (active first), then sort_order ASC.
 * Used by the admin list page.
 */
export function getAllServices(): ServiceRow[] {
  const db = getDb();
  return db.select().from(services).orderBy(desc(services.active), asc(services.sortOrder)).all();
}

/**
 * Returns a single service by id, or undefined if not found.
 */
export function getServiceById(id: number): ServiceRow | undefined {
  const db = getDb();
  return db.select().from(services).where(eq(services.id, id)).get();
}
