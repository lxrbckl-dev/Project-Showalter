import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `recovery_codes` — hashed recovery codes for admin account recovery.
 *
 * Exactly one active (unused) code per admin is enforced by the partial
 * unique index `recovery_codes_active` created in the migration:
 *   CREATE UNIQUE INDEX recovery_codes_active ON recovery_codes(admin_id) WHERE used_at IS NULL;
 *
 * When a code is used, `used_at` is set and a fresh code is generated and
 * shown once to the admin.
 */
export const recoveryCodes = sqliteTable('recovery_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminId: integer('admin_id').notNull(),
  codeHash: text('code_hash').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull(),
});

export type RecoveryCodeRow = typeof recoveryCodes.$inferSelect;
export type NewRecoveryCodeRow = typeof recoveryCodes.$inferInsert;
