/**
 * Auth.js session tables — owned by ticket 1B.
 *
 * @auth/drizzle-adapter expects four tables: users, accounts, sessions,
 * verificationTokens. We don't use Auth.js's built-in Passkey provider
 * (we roll our own WebAuthn via @simplewebauthn/server), so the
 * `authenticators` table the adapter mentions for passkeys is omitted.
 *
 * A `users` row is created the first time an admin signs in; it maps 1:1 to
 * an `admins` row by email. The `admins` row remains the source of truth for
 * active/enrolled state — `users` only exists so Auth.js can persist sessions.
 *
 * Migration: drizzle/0003_auth_sessions.sql
 */

import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
});

export const accounts = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  }),
);

export const sessions = sqliteTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  /**
   * Which passkey was used to establish this session. Nullable because
   * pre-0011 session rows have no associated credential. Added in migration
   * 0011 so the devices-management feature can identify "this device" and,
   * more importantly, invalidate exactly-the-right sessions when a credential
   * is removed. Stores the WebAuthn `credential_id` (base64url), matching
   * `credentials.credential_id`.
   */
  credentialId: text('credentialId'),
});

export const verificationTokens = sqliteTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// Silence unused-import warning for `sql`; kept for parity if defaults are added.
void sql;

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
