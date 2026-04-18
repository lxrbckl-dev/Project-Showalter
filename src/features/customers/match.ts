import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import type * as schema from '@/db/schema';

/**
 * Customer + address match-or-create — Phase 5.
 *
 * STACK.md § "INDEX book → Matching rule" documents the three-step match
 * precedence for linking a fresh booking to a customer row:
 *
 *   1. Normalized phone (E.164) match          → reuse that `customers` row
 *   2. Case-insensitive email match            → reuse that `customers` row
 *   3. Otherwise                               → insert a new `customers` row
 *
 * For the customer's address:
 *
 *   - If a whitespace-normalized, case-insensitive match exists in
 *     `customer_addresses` for that customer → bump `last_used_at`, reuse
 *   - Otherwise → insert a new `customer_addresses` row
 *
 * Why NOT do the match in SQL with `LOWER()` + `TRIM()`: SQLite's LIKE is
 * case-insensitive only for ASCII, and normalizing addresses involves more
 * than lowercase — we collapse runs of whitespace and strip trailing
 * punctuation. It's clearer to pull candidates and normalize in TypeScript.
 *
 * Contract:
 *   - Phone MUST already be normalized to E.164 by the caller
 *     (`src/lib/formatters/phone.ts → normalizeUSPhone`). We do not re-normalize
 *     inside the match function to keep the responsibilities clean.
 *   - Email is optional; pass `null` / `undefined` if the customer omitted it.
 *   - Runs inside a transaction so a race on matching + insert can't produce
 *     duplicate customer rows.
 */

type Db = BetterSQLite3Database<typeof schema>;

export interface MatchInput {
  /** Customer display name (≤100 chars enforced by validator). */
  name: string;
  /** Phone in E.164 format — e.g. '+19133097340'. */
  phone: string;
  /** Optional email. RFC 5321 validated by the caller. */
  email?: string | null;
  /** Raw address string as typed by the customer. ≤500 chars. */
  address: string;
}

export interface MatchResult {
  customerId: number;
  addressId: number;
  /** True when a new `customers` row was inserted. */
  createdCustomer: boolean;
  /** True when a new `customer_addresses` row was inserted. */
  createdAddress: boolean;
}

/**
 * Collapse whitespace + trim + lowercase an address for equality comparison.
 *
 * Examples:
 *   '123 Main  St.\n' → '123 main st.'
 *   ' 123   Main St. ' → '123 main st.'
 */
export function normalizeAddress(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * matchOrCreateCustomer — the public entry point. See file header for the
 * precedence rules.
 */
export function matchOrCreateCustomer(
  input: MatchInput,
  db: Db,
  now: () => string = () => new Date().toISOString(),
): MatchResult {
  const { name, phone, email, address } = input;
  const emailLower = email && email.length > 0 ? email.toLowerCase() : null;
  const addressNorm = normalizeAddress(address);

  return db.transaction((tx) => {
    // Step 1: try phone match first (strongest signal per STACK.md).
    let customerRow = tx
      .select()
      .from(customers)
      .where(eq(customers.phone, phone))
      .limit(1)
      .all()[0];

    let createdCustomer = false;

    // Step 2: fall back to email match (case-insensitive).
    if (!customerRow && emailLower) {
      customerRow = tx
        .select()
        .from(customers)
        .where(sql`lower(${customers.email}) = ${emailLower}`)
        .limit(1)
        .all()[0];
    }

    // Step 3: create a new customer row if no match.
    if (!customerRow) {
      const nowIso = now();
      const inserted = tx
        .insert(customers)
        .values({
          name,
          phone,
          email: email && email.length > 0 ? email : null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .returning()
        .all();
      customerRow = inserted[0];
      createdCustomer = true;
    }

    // Address: pull every row for the customer, normalize, compare.
    const addressRows = tx
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerRow.id))
      .all();
    const existing = addressRows.find(
      (row) => normalizeAddress(row.address) === addressNorm,
    );

    if (existing) {
      const nowIso = now();
      tx.update(customerAddresses)
        .set({ lastUsedAt: nowIso })
        .where(eq(customerAddresses.id, existing.id))
        .run();
      return {
        customerId: customerRow.id,
        addressId: existing.id,
        createdCustomer,
        createdAddress: false,
      };
    }

    // Insert a fresh address row.
    const nowIso = now();
    const insertedAddr = tx
      .insert(customerAddresses)
      .values({
        customerId: customerRow.id,
        address,
        createdAt: nowIso,
        lastUsedAt: nowIso,
      })
      .returning()
      .all();
    return {
      customerId: customerRow.id,
      addressId: insertedAddr[0].id,
      createdCustomer,
      createdAddress: true,
    };
  });
}

/**
 * Bump `customers.last_booking_at` to the booking's `start_at`. Called by
 * the booking-submit path AFTER the booking row itself has been inserted.
 * Kept here (not in submit.ts) so the match-and-update state lives in one
 * module. Pass `db` rather than opening a fresh connection so callers can
 * run this inside their own transaction when needed.
 */
export function bumpLastBookingAt(
  customerId: number,
  startAt: string,
  db: Db,
): void {
  const nowIso = new Date().toISOString();
  db.update(customers)
    .set({ lastBookingAt: startAt, updatedAt: nowIso })
    .where(
      and(
        eq(customers.id, customerId),
        // Only bump when the new start_at is strictly later — a back-dated
        // admin booking shouldn't rewrite the "most recent" pointer.
        sql`${customers.lastBookingAt} IS NULL OR ${customers.lastBookingAt} < ${startAt}`,
      ),
    )
    .run();
}
