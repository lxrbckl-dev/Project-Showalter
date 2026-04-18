import type { BookingStatus } from '@/db/schema/bookings';

/**
 * Booking state-machine rules — Phase 6.
 *
 * Canonical transition table lifted from STACK.md § Booking state machine +
 * § Complete/no-show queue. Keep this module the single source of truth so
 * the admin actions (`accept`, `decline`, `markCompleted`, `markNoShow`,
 * `reschedule`) and the customer self-cancel flow all validate against the
 * same matrix.
 *
 *   pending   ──▶ accepted | declined | canceled | expired
 *   accepted  ──▶ completed | no_show | canceled
 *   completed ──▶ (terminal — no transitions, no cancel, no reschedule)
 *   no_show   ──▶ (terminal)
 *   declined  ──▶ (terminal)
 *   canceled  ──▶ (terminal)
 *   expired   ──▶ (terminal)
 *
 * Terminal-on-write statuses release the slot hold (the partial UNIQUE
 * `bookings_active_start` excludes them automatically); `completed` and
 * `no_show` also release their hold since `start_at` is already in the past
 * by the time they fire.
 */

export const TERMINAL_STATUSES: readonly BookingStatus[] = [
  'completed',
  'no_show',
  'declined',
  'canceled',
  'expired',
];

/** True iff the status cannot transition further (no admin or customer action). */
export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Single allow-list of (from → to) transitions. Any mutation that touches
 * `bookings.status` MUST pass through this predicate — otherwise it's a bug.
 */
const ALLOWED: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['accepted', 'declined', 'canceled', 'expired'],
  accepted: ['completed', 'no_show', 'canceled'],
  completed: [],
  no_show: [],
  declined: [],
  canceled: [],
  expired: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Describe the UI buttons shown on the admin detail view for a booking in a
 * given status. Pure — no DB access. Pairs with the detail-page renderer.
 *
 *   pending            → [Accept] [Decline] [Reschedule]
 *   accepted (future)  → [Reschedule] [Cancel]
 *   accepted (past)    → [Mark completed] [Mark no-show]
 *   completed          → (none)
 *   …
 */
export type AdminAction =
  | 'accept'
  | 'decline'
  | 'reschedule'
  | 'cancel'
  | 'mark_completed'
  | 'mark_no_show';

export function availableAdminActions(
  status: BookingStatus,
  startAt: string,
  now: Date = new Date(),
): readonly AdminAction[] {
  if (status === 'pending') {
    return ['accept', 'decline', 'reschedule'];
  }
  if (status === 'accepted') {
    const startsMs = new Date(startAt).getTime();
    const isPast = startsMs <= now.getTime();
    return isPast
      ? ['mark_completed', 'mark_no_show']
      : ['reschedule', 'cancel'];
  }
  return [];
}
