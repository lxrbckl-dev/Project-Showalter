import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { asc, desc, eq, like, or, sql } from 'drizzle-orm';
import type * as schema from '@/db/schema';
import {
  customerAddresses,
  type CustomerAddressRow,
} from '@/db/schema/customer-addresses';
import { customers, type CustomerRow } from '@/db/schema/customers';

/**
 * Read-side queries for the customer directory (the INDEX book).
 *
 * Phase 6 only needs a small surface area:
 *   - `searchCustomers(q)` — powers the admin-create walk-in form's
 *     "pick existing customer" dropdown. SQLite `LIKE` for MVP; swap to
 *     FTS5 later (STACK.md § INDEX book → Admin search).
 *   - `getCustomerById` + `listAddressesForCustomer` — used to hydrate the
 *     selected-customer preview + the "reuse saved address" picker.
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface CustomerSearchResult {
  customer: CustomerRow;
  primaryAddress: string | null;
}

export function searchCustomers(
  db: Db,
  q: string,
  limit = 10,
): CustomerSearchResult[] {
  const trimmed = q.trim();
  if (trimmed.length === 0) {
    const recent = db
      .select()
      .from(customers)
      .orderBy(desc(customers.lastBookingAt))
      .limit(limit)
      .all();
    return recent.map((c) => ({ customer: c, primaryAddress: primaryAddressFor(db, c.id) }));
  }
  // SQLite's LIKE is case-insensitive for ASCII by default; `lower()` makes
  // the comparison explicit so future non-ASCII names (accented chars) still
  // match the expected key.
  const needle = `%${trimmed.toLowerCase()}%`;
  const rows = db
    .select()
    .from(customers)
    .where(
      or(
        like(sql`lower(${customers.name})`, needle),
        like(sql`lower(${customers.phone})`, needle),
        like(sql`lower(coalesce(${customers.email}, ''))`, needle),
      ),
    )
    .orderBy(desc(customers.lastBookingAt))
    .limit(limit)
    .all();
  return rows.map((c) => ({
    customer: c,
    primaryAddress: primaryAddressFor(db, c.id),
  }));
}

function primaryAddressFor(db: Db, customerId: number): string | null {
  const row = db
    .select({ address: customerAddresses.address })
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.lastUsedAt))
    .limit(1)
    .all()[0];
  return row?.address ?? null;
}

export function getCustomerById(
  db: Db,
  id: number,
): CustomerRow | null {
  const row = db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1)
    .all()[0];
  return row ?? null;
}

export function listAddressesForCustomer(
  db: Db,
  customerId: number,
): CustomerAddressRow[] {
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.lastUsedAt), asc(customerAddresses.id))
    .all();
}
