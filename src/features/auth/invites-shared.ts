/**
 * Shared non-action exports for the admin invites feature.
 *
 * Files that carry `'use server'` may only export async functions. Anything
 * client components need to import (constants, types, Zod schemas, pure
 * derivation helpers) lives here.
 */

import { z } from 'zod';

/** Invites expire 24 hours after creation. Not admin-configurable. */
export const INVITE_TTL_MS = 24 * 60 * 60_000;

/** Maximum length of the optional friendly label on an invite. */
export const INVITE_LABEL_MAX_LEN = 60;

/**
 * Email validator. Trim + lowercase happen after parsing (see
 * `normalizeEmail`). We keep validation liberal intentionally — the canonical
 * auth failure response fires on anything else, and email-shape rejection is
 * effectively invisible to an attacker.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Enter an email address')
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

export const labelSchema = z
  .string()
  .trim()
  .max(INVITE_LABEL_MAX_LEN, `Label must be ${INVITE_LABEL_MAX_LEN} characters or fewer`);

export const optionalLabelSchema = labelSchema.optional();

/** Canonical email normalization — lowercased + trimmed. Used everywhere. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Status states surfaced in the UI. `used` implies accepted + terminal. */
export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked';

/**
 * DTO returned by `listInvites()` and rendered by the admins-settings page.
 * Timestamps are ISO-8601 strings so the client renders deterministically.
 */
export type InviteView = {
  id: number;
  token: string;
  invitedEmail: string;
  label: string | null;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  /** Email of the admin that was created when this invite was accepted. */
  usedByEmail: string | null;
  revokedAt: string | null;
  createdByEmail: string | null;
};

export type InviteRowForStatus = {
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};

/**
 * Precedence (highest → lowest): `revoked` > `used` > `expired` > `pending`.
 *
 * Revoked wins over used in the unlikely case where a ceremony races — we'd
 * rather surface the revoke intent than "quietly used." Expired only applies
 * if the invite is otherwise pending (not revoked, not used), so a used
 * invite from weeks ago still reads `used`, not `expired`.
 *
 * `nowIso` is an injection point for time mocking in tests.
 */
export function deriveStatus(
  row: InviteRowForStatus,
  nowIso: string = new Date().toISOString(),
): InviteStatus {
  if (row.revokedAt) return 'revoked';
  if (row.usedAt) return 'used';
  if (row.expiresAt < nowIso) return 'expired';
  return 'pending';
}

/**
 * Build the full invite URL. Falls back to `/admin/signup?token=...` when no
 * base is provided — callers should pass the admin-visible origin so the
 * copied URL works when pasted elsewhere.
 */
export function buildInviteUrl(token: string, baseUrl?: string): string {
  const base = (baseUrl ?? '').replace(/\/+$/, '');
  const path = `/admin/signup?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}
