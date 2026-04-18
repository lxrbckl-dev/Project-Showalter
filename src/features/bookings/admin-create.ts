'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import {
  adminCreateBookingCore,
  type AdminCreateResult,
} from './admin-create-core';

/**
 * Admin-initiated booking server action — Phase 6.
 *
 * Thin wrapper around `adminCreateBookingCore`. Enforces an admin session
 * (belt-and-suspenders with the admin layout's auth gate) and revalidates
 * the inbox path on success so the new booking appears immediately.
 */

export type { AdminCreateResult };

export async function adminCreateBooking(
  formData: FormData,
): Promise<AdminCreateResult> {
  const session = await auth();
  if (!session) {
    throw new Error('unauthenticated');
  }

  const result = adminCreateBookingCore({
    input: formData,
    db: getDb(),
  });

  if (result.ok) {
    try {
      revalidatePath('/admin/inbox');
      revalidatePath('/admin');
    } catch {
      // Non-request contexts — ignore.
    }
  }

  return result;
}
