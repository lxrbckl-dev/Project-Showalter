'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import {
  rescheduleBookingCore,
  type RescheduleResult,
} from './reschedule-core';

/**
 * Admin reschedule server action — Phase 6.
 *
 * Single atomic "cancel old + create new" transaction. See the core module
 * for the full rationale. This file is the `'use server'` surface plus the
 * auth gate and `revalidatePath` fan-out.
 */

export type { RescheduleResult };

export async function rescheduleBooking(
  oldBookingId: number,
  expectedUpdatedAt: string,
  newStartAt: string,
): Promise<RescheduleResult> {
  const session = await auth();
  if (!session) {
    throw new Error('unauthenticated');
  }

  const result = rescheduleBookingCore({
    oldBookingId,
    expectedUpdatedAt,
    newStartAt,
    db: getDb(),
  });

  if (result.ok) {
    try {
      revalidatePath('/admin/inbox');
      revalidatePath(`/admin/inbox/${oldBookingId}`);
      revalidatePath(`/admin/inbox/${result.newBooking.id}`);
      revalidatePath(`/bookings/${result.oldBooking.token}`);
      revalidatePath(`/bookings/${result.newBooking.token}`);
      revalidatePath('/admin');
    } catch {
      // Non-request contexts — ignore.
    }
  }

  return result;
}
