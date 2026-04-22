import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { createTestDb } from '@/db/test-helpers';
import { matchOrCreateCustomer, normalizeAddress } from './match';

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Exhaustive match-or-create tests — every branch in the 3-step customer
 * match + 2-step address match described in STACK.md § INDEX book.
 */

let testHandle: ReturnType<typeof createTestDb>;
let db: Db;

describe('normalizeAddress', () => {
  it('collapses whitespace, trims, and lowercases', () => {
    expect(normalizeAddress('  123   Main St. ')).toBe('123 main st.');
  });

  it('treats newlines and tabs as whitespace', () => {
    expect(normalizeAddress('123\nMain\tSt')).toBe('123 main st');
  });

  it('is a noop on an already-normalized address', () => {
    expect(normalizeAddress('4567 oak ave')).toBe('4567 oak ave');
  });
});

describe('matchOrCreateCustomer', () => {
  beforeEach(() => {
    testHandle = createTestDb({ inMemory: true });
    db = testHandle.db as Db;
  });

  it('branch 1: phone match → reuses existing customer, inserts new address', () => {
    const seed = db
      .insert(customers)
      .values({
        name: 'Jane Doe',
        phone: '+19133097340',
        email: 'jane@example.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();
    const seedId = seed[0].id;

    const result = matchOrCreateCustomer(
      {
        name: 'Jane D.', // typed differently this time
        phone: '+19133097340',
        email: 'different@example.com',
        address: '123 Main St',
      },
      db,
    );

    expect(result.createdCustomer).toBe(false);
    expect(result.customerId).toBe(seedId);
    expect(result.createdAddress).toBe(true);

    // Master row name is NOT overwritten (Phase 5 contract) — booking row
    // will hold the snapshot of what the customer typed this time.
    const after = db.select().from(customers).where(eq(customers.id, seedId)).all();
    expect(after[0].name).toBe('Jane Doe');
    testHandle.cleanup();
  });

  it('branch 2: email match (case-insensitive) → reuses existing customer', () => {
    const seed = db
      .insert(customers)
      .values({
        name: 'John Doe',
        phone: '+19133091111',
        email: 'John@Example.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();

    const result = matchOrCreateCustomer(
      {
        name: 'John',
        phone: '+19133092222', // DIFFERENT phone
        email: 'JOHN@example.com', // same email, different case
        address: '456 Oak Ave',
      },
      db,
    );

    expect(result.createdCustomer).toBe(false);
    expect(result.customerId).toBe(seed[0].id);
    testHandle.cleanup();
  });

  it('branch 3: no match → inserts new customer + new address', () => {
    const result = matchOrCreateCustomer(
      {
        name: 'Brand New',
        phone: '+19133093333',
        email: 'new@example.com',
        address: '789 Pine Ln',
      },
      db,
    );

    expect(result.createdCustomer).toBe(true);
    expect(result.createdAddress).toBe(true);

    const rows = db.select().from(customers).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('+19133093333');
    testHandle.cleanup();
  });

  it('branch 4: address reuse → bumps last_used_at, does not insert', () => {
    // Seed customer + address.
    const seed = db
      .insert(customers)
      .values({
        name: 'Repeat Customer',
        phone: '+19133094444',
        email: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();
    const seedAddr = db
      .insert(customerAddresses)
      .values({
        customerId: seed[0].id,
        address: '100 Elm Road',
        createdAt: '2026-01-01T00:00:00Z',
        lastUsedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();

    const later = () => '2026-04-17T12:00:00Z';
    const result = matchOrCreateCustomer(
      {
        name: 'Repeat Customer',
        phone: '+19133094444',
        // Different whitespace / case — should still match.
        address: '  100  ELM Road\n',
      },
      db,
      later,
    );

    expect(result.customerId).toBe(seed[0].id);
    expect(result.addressId).toBe(seedAddr[0].id);
    expect(result.createdAddress).toBe(false);

    // Addresses table still has only one row; last_used_at bumped.
    const addrs = db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, seed[0].id))
      .all();
    expect(addrs).toHaveLength(1);
    expect(addrs[0].lastUsedAt).toBe('2026-04-17T12:00:00Z');
    testHandle.cleanup();
  });

  it('branch 5: same customer, different address → inserts new address row', () => {
    const seed = db
      .insert(customers)
      .values({
        name: 'Many Yards',
        phone: '+19133095555',
        email: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();
    db.insert(customerAddresses)
      .values({
        customerId: seed[0].id,
        address: '100 Elm Road',
        createdAt: '2026-01-01T00:00:00Z',
        lastUsedAt: '2026-01-01T00:00:00Z',
      })
      .run();

    const result = matchOrCreateCustomer(
      {
        name: 'Many Yards',
        phone: '+19133095555',
        address: '200 Maple Drive', // truly different
      },
      db,
    );

    expect(result.createdAddress).toBe(true);
    const addrs = db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, seed[0].id))
      .all();
    expect(addrs).toHaveLength(2);
    testHandle.cleanup();
  });

  it('phone match takes precedence over email match', () => {
    // Customer A: phone P1, email E1
    const a = db
      .insert(customers)
      .values({
        name: 'Customer A',
        phone: '+19130000001',
        email: 'alpha@example.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();
    // Customer B: phone P2, email E2 — distinct from A.
    db.insert(customers)
      .values({
        name: 'Customer B',
        phone: '+19130000002',
        email: 'beta@example.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      .returning()
      .all();

    // Submit with A's phone + B's email — A should win.
    const result = matchOrCreateCustomer(
      {
        name: 'Whoever',
        phone: '+19130000001',
        email: 'beta@example.com',
        address: 'irrelevant',
      },
      db,
    );

    expect(result.customerId).toBe(a[0].id);
    testHandle.cleanup();
  });

  it('null / empty email is handled (no unique-constraint clash)', () => {
    // Two customers with NULL email, different phones — should both be insertable.
    matchOrCreateCustomer(
      {
        name: 'No Email 1',
        phone: '+19130000003',
        email: null,
        address: '1 Test Dr',
      },
      db,
    );
    matchOrCreateCustomer(
      {
        name: 'No Email 2',
        phone: '+19130000004',
        email: '',
        address: '2 Test Dr',
      },
      db,
    );

    expect(db.select().from(customers).all()).toHaveLength(2);
    testHandle.cleanup();
  });
});
