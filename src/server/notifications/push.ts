/**
 * Web Push dispatcher — Phase 8A.
 *
 * Public API (stable — Phase 8B imports this):
 *
 *   sendPush(adminId, payload)      — fan out to every subscription for ONE admin
 *   sendPushToAllAdmins(payload)    — fan out to every subscription across all active admins
 *   isPushConfigured()              — env sanity check (VAPID keys present)
 *
 * Semantics:
 *   - Success → nothing to do; the browser/OS surfaces the notification via
 *     the service worker's `push` handler (see public/sw.js).
 *   - HTTP 404 / 410 from the push service → the subscription is "gone"
 *     (browser uninstalled, permission revoked, endpoint rotated by the
 *     vendor). We DELETE the row — keeping it wastes bandwidth and creates
 *     log noise on every fire.
 *   - Other errors → logged and swallowed. One flaky push MUST NOT break a
 *     booking submit flow (the whole reason we wrap every dispatch call in
 *     this module — callers treat it as fire-and-forget).
 *
 * The module is intentionally I/O-light at import time: `web-push` is loaded
 * and VAPID details are applied on the first call, not at module top level,
 * so importing this file in edge/build contexts doesn't blow up when the
 * env vars are absent.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins } from '@/db/schema/admins';
import {
  pushSubscriptions,
  type PushSubscriptionRow,
} from '@/db/schema/push-subscriptions';

export interface PushPayload {
  /** Short, user-visible headline shown in the OS notification row. */
  title: string;
  /** One-line body text rendered under the title. */
  body: string;
  /**
   * Absolute path (starting with `/`) or full URL that the notification
   * click handler focuses / opens. The service worker (public/sw.js)
   * uses this to locate an existing admin tab or open a new one.
   * Defaults to `/admin/notifications` when omitted.
   */
  url?: string;
}

export interface SendPushResult {
  /** Endpoints we asked the push service to deliver to. */
  attempted: number;
  /** Endpoints the push service accepted (2xx). */
  delivered: number;
  /** Endpoints we removed because the push service returned 404/410. */
  removed: number;
  /** Non-gone delivery errors (transient or unexpected). */
  failed: number;
}

/**
 * Loader indirection. `web-push` is CJS and dynamically imported on first
 * use so vitest / Next's edge/build environment doesn't choke on the
 * `node:crypto` subdeps at module-graph resolution time.
 *
 * Also keeps the module importable in tests where we inject a fake sender.
 */
type WebPushSender = (
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  payload: string,
  options?: { vapidDetails?: { subject: string; publicKey: string; privateKey: string } },
) => Promise<{ statusCode: number }>;

let _cachedSender: WebPushSender | null = null;
let _vapidApplied = false;

/** Override for tests — swap in a stub sender. Call with `null` to reset. */
export function __setSenderForTests(sender: WebPushSender | null): void {
  _cachedSender = sender;
  _vapidApplied = sender !== null; // skip real VAPID setup in tests
}

async function getSender(): Promise<WebPushSender> {
  if (_cachedSender) return _cachedSender;
  // Dynamic import keeps this module loadable without web-push installed
  // (e.g. during pre-install typecheck on fresh clones).
  const mod = await import('web-push');
  const wp = (mod as unknown as { default?: unknown }).default ?? mod;
  // web-push's .sendNotification returns { statusCode, body, headers }.
  const sender: WebPushSender = (sub, payload) =>
    (wp as { sendNotification: WebPushSender }).sendNotification(sub, payload);
  _cachedSender = sender;
  if (!_vapidApplied) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (publicKey && privateKey && subject) {
      try {
        (wp as {
          setVapidDetails: (s: string, pub: string, priv: string) => void;
        }).setVapidDetails(subject, publicKey, privateKey);
        _vapidApplied = true;
      } catch (err) {
        // Malformed VAPID keys — log once and continue; every subsequent
        // send attempt will also fail loudly via the push service.
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'push: invalid VAPID config',
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }
  return sender;
}

/** True when all three VAPID env vars are populated. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function extractStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const rec = err as { statusCode?: unknown };
  const code = rec.statusCode;
  return typeof code === 'number' ? code : null;
}

/**
 * Core dispatch — takes an explicit list of subscription rows so it can be
 * unit-tested with an in-memory DB. Production callers go through
 * `sendPush` / `sendPushToAllAdmins`, which query the DB and then delegate.
 */
export async function dispatchToSubscriptions(
  rows: PushSubscriptionRow[],
  payload: PushPayload,
  deps: {
    sender: WebPushSender;
    deleteSubscription: (id: number) => void;
  },
): Promise<SendPushResult> {
  const result: SendPushResult = {
    attempted: rows.length,
    delivered: 0,
    removed: 0,
    failed: 0,
  };
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/admin/notifications',
  });
  for (const row of rows) {
    try {
      const res = await deps.sender(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        body,
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        result.delivered += 1;
      } else if (res.statusCode === 404 || res.statusCode === 410) {
        deps.deleteSubscription(row.id);
        result.removed += 1;
      } else {
        result.failed += 1;
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            level: 'warn',
            msg: 'push: non-2xx from push service',
            statusCode: res.statusCode,
            subscriptionId: row.id,
          }),
        );
      }
    } catch (err) {
      const code = extractStatusCode(err);
      if (code === 404 || code === 410) {
        deps.deleteSubscription(row.id);
        result.removed += 1;
      } else {
        result.failed += 1;
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            level: 'warn',
            msg: 'push: delivery failed',
            subscriptionId: row.id,
            statusCode: code,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }
  return result;
}

/**
 * Fan out a push to every device a single admin has subscribed. Never
 * throws — callers treat this as fire-and-forget. Returns a structured
 * summary for logging / tests.
 */
export async function sendPush(
  adminId: number,
  payload: PushPayload,
): Promise<SendPushResult> {
  // Fast-path: if VAPID isn't configured at all, there's nothing to send.
  if (!isPushConfigured() && !_cachedSender) {
    return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
  }
  const db = getDb();
  const rows = db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.adminId, adminId))
    .all();
  if (rows.length === 0) {
    return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
  }
  let sender: WebPushSender;
  try {
    sender = await getSender();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'push: sender unavailable',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { attempted: rows.length, delivered: 0, removed: 0, failed: rows.length };
  }
  return dispatchToSubscriptions(rows, payload, {
    sender,
    deleteSubscription: (id: number) => {
      try {
        db.delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, id))
          .run();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          JSON.stringify({
            level: 'warn',
            msg: 'push: subscription cleanup failed',
            subscriptionId: id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    },
  });
}

/**
 * Fan out a single notification to every device of every active,
 * enrolled admin. Used by booking flows where "the admin inbox" is the
 * semantic target (new booking, customer cancel, etc.).
 *
 * Never throws. Aggregates per-admin results into a single summary.
 */
export async function sendPushToAllAdmins(
  payload: PushPayload,
): Promise<SendPushResult> {
  const db = getDb();
  let activeAdmins: { id: number }[];
  try {
    activeAdmins = db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.active, 1))
      .all();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: 'warn',
        msg: 'push: admin lookup failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { attempted: 0, delivered: 0, removed: 0, failed: 0 };
  }

  const aggregate: SendPushResult = {
    attempted: 0,
    delivered: 0,
    removed: 0,
    failed: 0,
  };
  for (const a of activeAdmins) {
    const r = await sendPush(a.id, payload);
    aggregate.attempted += r.attempted;
    aggregate.delivered += r.delivered;
    aggregate.removed += r.removed;
    aggregate.failed += r.failed;
  }
  return aggregate;
}
