'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import {
  cancelByCustomerCore,
  type CancelResult,
} from './cancel-by-customer-core';

/**
 * Customer self-cancel server action — Phase 5.
 *
 * Thin wrapper around the pure `cancelByCustomerCore`. See that module for
 * the state-machine rules and the notification-row contract.
 *
 * Why split: Next 15's `'use server'` requires every module-level export to
 * be async. Keeping the pure/sync core in `cancel-by-customer-core.ts`
 * makes it unit-testable while this file stays a clean RPC surface.
 */

export type { CancelResult };

export async function cancelByCustomer(token: string): Promise<CancelResult> {
  const result = cancelByCustomerCore({ token, db: getDb() });
  try {
    revalidatePath(`/bookings/${token}`);
  } catch {
    // Non-request contexts (CLI, tests) — ignore.
  }
  return result;
}
