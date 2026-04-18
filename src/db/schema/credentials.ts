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
  /**
   * Human-friendly device label, e.g. "iPhone 15" or "Work laptop". Set by
   * the admin during add-device / rename flows; falls back to `deviceType`
   * in the UI when null. Added in migration 0011.
   */
  label: text('label'),
  createdAt: text('created_at').notNull(),
});

export type CredentialRow = typeof credentials.$inferSelect;
export type NewCredentialRow = typeof credentials.$inferInsert;
