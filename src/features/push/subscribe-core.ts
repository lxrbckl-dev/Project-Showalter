import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { admins } from '@/db/schema/admins';
import { pushSubscriptions } from '@/db/schema/push-subscriptions';
import type * as schema from '@/db/schema';

/**
 * Pure subscribe/unsubscribe helpers — Phase 8A.
 *
 * Split from `actions.ts` so the logic can be exercised from unit tests
 * without paying the Next `'use server'` tax. The server action in
 * `actions.ts` calls these after resolving the signed-in admin.
 */

type Db = BetterSQLite3Database<typeof schema>;

/** Validation schema for the client's PushSubscription.toJSON() output. */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().min(1).max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export type SubscribeResult =
  | { ok: true; created: boolean; subscriptionId: number }
  | { ok: false; kind: 'validation'; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: 'admin_not_found' };

/**
 * Persist (or upsert) a push subscription for the given admin.
 *
 * Re-subscribe semantics: the browser yields the same `endpoint` on the
 * same install, so `endpoint` is UNIQUE. When we see an existing row for
 * the same endpoint we refresh the keys + admin binding rather than insert
 * a duplicate — this covers "admin logs out + back in on the same browser"
 * and handles the edge case where keys rotated.
 */
export function subscribePushCore(opts: {
  db: Db;
  adminEmail: string;
  input: unknown;
  userAgent?: string | null;
  now?: Date;
}): SubscribeResult {
  const { db, adminEmail, input, userAgent, now = new Date() } = opts;

  const parsed = pushSubscribeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, kind: 'validation', fieldErrors };
  }

  const email = adminEmail.toLowerCase();
  const admin = db
    .select({ id: admins.id })
    .from(admins)
    .where(and(eq(admins.email, email), eq(admins.active, 1)))
    .limit(1)
    .all()[0];
  if (!admin) {
    return { ok: false, kind: 'admin_not_found' };
  }

  const { endpoint, keys } = parsed.data;
  const existing = db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1)
    .all()[0];

  if (existing) {
    db.update(pushSubscriptions)
      .set({
        adminId: admin.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      })
      .where(eq(pushSubscriptions.id, existing.id))
      .run();
    return { ok: true, created: false, subscriptionId: existing.id };
  }

  const inserted = db
    .insert(pushSubscriptions)
    .values({
      adminId: admin.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
      createdAt: now.toISOString(),
    })
    .returning({ id: pushSubscriptions.id })
    .all();
  return { ok: true, created: true, subscriptionId: inserted[0].id };
}

export type UnsubscribeResult =
  | { ok: true; removed: number }
  | { ok: false; kind: 'not_found' };

/**
 * Remove a subscription by endpoint — the only identifier the client has
 * without a trip back through the DB. Scoped to the admin so one admin
 * can't knock another's device offline by guessing endpoints.
 */
export function unsubscribePushCore(opts: {
  db: Db;
  adminEmail: string;
  endpoint: string;
}): UnsubscribeResult {
  const { db, adminEmail, endpoint } = opts;
  const email = adminEmail.toLowerCase();
  const admin = db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1)
    .all()[0];
  if (!admin) {
    return { ok: false, kind: 'not_found' };
  }
  const result = db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.adminId, admin.id),
      ),
    )
    .run();
  // better-sqlite3's RunResult.changes is a number.
  const removed = Number((result as { changes?: number }).changes ?? 0);
  if (removed === 0) {
    return { ok: false, kind: 'not_found' };
  }
  return { ok: true, removed };
}

/**
 * Does the admin have at least one subscription containing the given
 * endpoint? Used by the client UI on page load to render the "subscribed"
 * / "not subscribed" state without exposing the full DB.
 */
export function hasSubscriptionForEndpoint(opts: {
  db: Db;
  adminEmail: string;
  endpoint: string;
}): boolean {
  const { db, adminEmail, endpoint } = opts;
  const email = adminEmail.toLowerCase();
  const admin = db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1)
    .all()[0];
  if (!admin) return false;
  const row = db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.adminId, admin.id),
      ),
    )
    .limit(1)
    .all()[0];
  return Boolean(row);
}
