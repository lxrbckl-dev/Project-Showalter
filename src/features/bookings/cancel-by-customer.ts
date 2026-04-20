'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import {
  cancelByCustomerCore,
  type CancelResult,
} from './cancel-by-customer-core';

/**
 * Customer self-cancel server action.
 *
 * Thin wrapper around the pure `cancelByCustomerCore`. Revalidates the
 * customer's status page so the post-cancel banner renders on next paint.
 */

export type { CancelResult };

export async function cancelByCustomer(
  token: string,
  reason?: string | null,
): Promise<CancelResult> {
  const db = getDb();
  const result = cancelByCustomerCore({ token, db, reason });
  try {
    revalidatePath(`/bookings/${token}`);
  } catch {
    // Non-request contexts (CLI, tests) — ignore.
  }
  return result;
}
