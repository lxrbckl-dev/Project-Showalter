'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import { decideBookingCore, type DecideResult } from './decide-core';
import { invalidateLandingStatsCache } from '@/features/stats/queries';

/**
 * Admin decide server actions — Phase 6.
 *
 * Thin wrappers around `decideBookingCore`. Each action:
 *   1. Enforces an authenticated admin session (defense in depth alongside
 *      the admin layout's `auth()` guard — server actions can be POSTed
 *      directly to the action endpoint, bypassing the layout).
 *   2. Calls the pure core with the caller-observed `expectedUpdatedAt` so
 *      the optimistic lock can reject stale writes.
 *   3. Revalidates the inbox + detail paths on success.
 *
 * State-machine rules (from STACK.md § Booking state machine):
 *   - accept   : pending → accepted
 *   - decline  : pending → declined (slot released by partial UNIQUE index)
 *   - markCompleted : accepted → completed (TERMINAL — cannot cancel/reschedule)
 *   - markNoShow    : accepted → no_show   (TERMINAL)
 *
 * On conflict (stale `updated_at`) the action returns a descriptive result the
 * client UI can surface as a friendly "someone else just updated this" banner.
 */

export type { DecideResult };

async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!session) {
    throw new Error('unauthenticated');
  }
}

function revalidateInbox(bookingId: number): void {
  try {
    revalidatePath('/admin/inbox');
    revalidatePath(`/admin/inbox/${bookingId}`);
    revalidatePath('/admin');
    // Invalidate landing-page stats cache when booking status changes — the
    // completed count and customers-served figures may have changed.
    invalidateLandingStatsCache();
    revalidatePath('/');
  } catch {
    // Non-request contexts (tests, CLI) — ignore.
  }
}

export async function acceptBooking(
  bookingId: number,
  expectedUpdatedAt: string,
): Promise<DecideResult> {
  await requireAdmin();
  const result = decideBookingCore({
    bookingId,
    expectedUpdatedAt,
    nextStatus: 'accepted',
    db: getDb(),
  });
  if (result.ok) revalidateInbox(bookingId);
  return result;
}

/**
 * Decline a pending booking. The optional `reason` is currently ignored on
 * the server side — the confirmation message flows through Sawyer's mailto:
 * and sms: buttons (Phase 5 templates), not a server-persisted reason.
 * Kept in the signature so later phases (e.g. admin audit log) don't need
 * a breaking change.
 */
export async function declineBooking(
  bookingId: number,
  expectedUpdatedAt: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason?: string,
): Promise<DecideResult> {
  await requireAdmin();
  const result = decideBookingCore({
    bookingId,
    expectedUpdatedAt,
    nextStatus: 'declined',
    db: getDb(),
  });
  if (result.ok) revalidateInbox(bookingId);
  return result;
}

export async function markCompleted(
  bookingId: number,
  expectedUpdatedAt: string,
): Promise<DecideResult> {
  await requireAdmin();
  const result = decideBookingCore({
    bookingId,
    expectedUpdatedAt,
    nextStatus: 'completed',
    db: getDb(),
  });
  if (result.ok) revalidateInbox(bookingId);
  return result;
}

export async function markNoShow(
  bookingId: number,
  expectedUpdatedAt: string,
): Promise<DecideResult> {
  await requireAdmin();
  const result = decideBookingCore({
    bookingId,
    expectedUpdatedAt,
    nextStatus: 'no_show',
    db: getDb(),
  });
  if (result.ok) revalidateInbox(bookingId);
  return result;
}

/**
 * Admin-initiated cancel of an accepted booking (from the detail page).
 * Distinct from customer self-cancel: no notification row is inserted (the
 * admin is the initiator; there's nobody to notify in-app). Slot is released
 * automatically via the partial UNIQUE index.
 */
export async function cancelBookingByAdmin(
  bookingId: number,
  expectedUpdatedAt: string,
): Promise<DecideResult> {
  await requireAdmin();
  const result = decideBookingCore({
    bookingId,
    expectedUpdatedAt,
    nextStatus: 'canceled',
    db: getDb(),
  });
  if (result.ok) revalidateInbox(bookingId);
  return result;
}
