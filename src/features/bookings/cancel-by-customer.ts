'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';
import { services } from '@/db/schema/services';
import {
  cancelByCustomerCore,
  type CancelResult,
} from './cancel-by-customer-core';
import { sendPushToAllAdmins } from '@/server/notifications/push';

/**
 * Customer self-cancel server action — Phase 5.
 *
 * Thin wrapper around the pure `cancelByCustomerCore`. See that module for
 * the state-machine rules and the notification-row contract.
 *
 * Phase 8A extension: on successful cancel, fan out a Web Push to every
 * active admin so Sawyer sees it immediately on his phone. The core stays
 * pure (no I/O beyond the DB transaction) — push is done here, after the
 * core's DB writes commit. Failures are swallowed; they MUST NOT rollback
 * the cancel (the DB transaction has already committed).
 */

export type { CancelResult };

export async function cancelByCustomer(
  token: string,
  reason?: string | null,
): Promise<CancelResult> {
  const db = getDb();

  // Capture identifying context BEFORE the cancel so we can build a useful
  // push body (the core's existing notification uses serviceName + startAt
  // from the same joined reads — we repeat the minimal read here so push
  // stays a thin concern). If the core returns non-ok we bail without
  // dispatching.
  let contextForPush: { customerName: string; serviceName: string; startAt: string } | null = null;
  const row = db.select().from(bookings).where(eq(bookings.token, token)).limit(1).all()[0];
  if (row) {
    const svc = db
      .select({ name: services.name })
      .from(services)
      .where(eq(services.id, row.serviceId))
      .limit(1)
      .all()[0];
    contextForPush = {
      customerName: row.customerName,
      serviceName: svc?.name ?? 'a booking',
      startAt: row.startAt,
    };
  }

  const result = cancelByCustomerCore({ token, db, reason });
  try {
    revalidatePath(`/bookings/${token}`);
  } catch {
    // Non-request contexts (CLI, tests) — ignore.
  }

  if (result.ok && contextForPush) {
    try {
      await sendPushToAllAdmins({
        title: 'Customer cancelled',
        body: `${contextForPush.customerName} cancelled ${contextForPush.serviceName} on ${formatDateShort(contextForPush.startAt)}`,
        url: '/admin/notifications',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'warn',
          msg: 'cancel: push fan-out failed',
          token,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return result;
}

function formatDateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
