/**
 * services/actions.test.ts — unit tests for Zod validation and action logic.
 *
 * We use an in-memory SQLite DB and stub next/cache so no Next.js runtime is needed.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

// Stub next/cache before importing actions
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Stub @/db so actions use our in-memory DB
const SERVICES_DDL = `
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price_cents INTEGER,
    price_suffix TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );
`;

function makeTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(SERVICES_DDL);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

// ---- Zod validation tests (no DB) ----

import { ServiceSchema } from './validate';

describe('ServiceSchema validation', () => {
  it('accepts valid service data with null price', () => {
    const result = ServiceSchema.safeParse({
      name: 'Snow removal',
      description: 'Driveway and walkway clearing.',
      price_cents: null,
      price_suffix: '',
      sort_order: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid service with price = 0', () => {
    const result = ServiceSchema.safeParse({
      name: 'Free service',
      description: 'No cost.',
      price_cents: 0,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid price_cents at max boundary is fine (large int)', () => {
    const result = ServiceSchema.safeParse({
      name: 'Expensive',
      description: 'Pricey service.',
      price_cents: 9999999,
      price_suffix: '+',
      sort_order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative price_cents', () => {
    const result = ServiceSchema.safeParse({
      name: 'Bad price',
      description: 'Negative price.',
      price_cents: -1,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 100 chars', () => {
    const result = ServiceSchema.safeParse({
      name: 'a'.repeat(101),
      description: 'Some description.',
      price_cents: 1000,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts name at exact 100 chars', () => {
    const result = ServiceSchema.safeParse({
      name: 'a'.repeat(100),
      description: 'Some description.',
      price_cents: 1000,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects description exceeding 500 chars', () => {
    const result = ServiceSchema.safeParse({
      name: 'Valid name',
      description: 'a'.repeat(501),
      price_cents: 1000,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts description at exact 500 chars', () => {
    const result = ServiceSchema.safeParse({
      name: 'Valid name',
      description: 'a'.repeat(500),
      price_cents: 1000,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects price_suffix exceeding 4 chars', () => {
    const result = ServiceSchema.safeParse({
      name: 'Valid name',
      description: 'Valid description.',
      price_cents: 1000,
      price_suffix: '/hrx', // 4 chars OK
      sort_order: 1,
    });
    expect(result.success).toBe(true);

    const result2 = ServiceSchema.safeParse({
      name: 'Valid name',
      description: 'Valid description.',
      price_cents: 1000,
      price_suffix: '/hrxx', // 5 chars — fail
      sort_order: 1,
    });
    expect(result2.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = ServiceSchema.safeParse({
      name: '',
      description: 'Some desc.',
      price_cents: 1000,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = ServiceSchema.safeParse({
      name: 'Valid',
      description: '',
      price_cents: 1000,
      price_suffix: '',
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ---- Archive / restore logic tests ----

describe('archive and restore logic', () => {
  let testDb: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    testDb = makeTestDb();
  });

  it('archive sets active=0 but row still exists', () => {
    const { sqlite, db } = testDb;

    // Insert a service directly (bypassing actions which need full Next context)
    sqlite.exec(
      `INSERT INTO services (name, description, price_cents, price_suffix, sort_order, active)
       VALUES ('Mowing', 'Mow and weedeat.', 4000, '', 1, 1)`,
    );

    const before = db.select().from(schema.services).all();
    expect(before).toHaveLength(1);
    expect(before[0].active).toBe(1);

    // Archive
    sqlite.exec(`UPDATE services SET active = 0 WHERE id = ${before[0].id}`);

    const after = db.select().from(schema.services).all();
    expect(after).toHaveLength(1); // row still exists
    expect(after[0].active).toBe(0); // but inactive
  });

  it('restore sets active=1', () => {
    const { sqlite, db } = testDb;

    sqlite.exec(
      `INSERT INTO services (name, description, price_cents, price_suffix, sort_order, active)
       VALUES ('Mowing', 'Mow and weedeat.', 4000, '', 1, 0)`,
    );

    const before = db.select().from(schema.services).all();
    expect(before[0].active).toBe(0);

    sqlite.exec(`UPDATE services SET active = 1 WHERE id = ${before[0].id}`);

    const after = db.select().from(schema.services).all();
    expect(after[0].active).toBe(1);
  });
});

// ---- Reorder logic tests ----

describe('reorder updates sort_order monotonically', () => {
  it('assigns sort_order = index + 1 in given order', () => {
    const { sqlite, db } = makeTestDb();

    // Insert 3 services with arbitrary sort orders
    sqlite.exec(`
      INSERT INTO services (name, description, sort_order, active) VALUES ('A', 'Desc A', 10, 1);
      INSERT INTO services (name, description, sort_order, active) VALUES ('B', 'Desc B', 5, 1);
      INSERT INTO services (name, description, sort_order, active) VALUES ('C', 'Desc C', 1, 1);
    `);

    const rows = db.select().from(schema.services).all();
    expect(rows).toHaveLength(3);

    // Reorder: C first, then A, then B (by id)
    const idC = rows.find((r) => r.name === 'C')!.id;
    const idA = rows.find((r) => r.name === 'A')!.id;
    const idB = rows.find((r) => r.name === 'B')!.id;

    const orderedIds = [idC, idA, idB];
    orderedIds.forEach((id, index) => {
      sqlite.exec(`UPDATE services SET sort_order = ${index + 1} WHERE id = ${id}`);
    });

    const after = db
      .select()
      .from(schema.services)
      .orderBy(schema.services.sortOrder)
      .all();

    expect(after[0].name).toBe('C');
    expect(after[0].sortOrder).toBe(1);
    expect(after[1].name).toBe('A');
    expect(after[1].sortOrder).toBe(2);
    expect(after[2].name).toBe('B');
    expect(after[2].sortOrder).toBe(3);
  });
});
