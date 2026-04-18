import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * `credentials` — one row per registered passkey.
 *
 * An admin may enroll multiple devices (phone, laptop, tablet), each with
 * their own WebAuthn credential. `admin_id` FKs into `admins.id`.
 */
export const credentials = sqliteTable('credentials', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminId: integer('admin_id').notNull(),
  credentialId: text('credential_id').unique().notNull(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceType: text('device_type'),
  createdAt: text('created_at').notNull(),
});

export type CredentialRow = typeof credentials.$inferSelect;
export type NewCredentialRow = typeof credentials.$inferInsert;
