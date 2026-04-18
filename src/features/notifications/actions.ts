'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import {
  markAllAsReadCore,
  markAsReadCore,
} from './mark-read-core';

/**
 * Admin notification actions — Phase 6.
 *
 * Two server actions that back the `/admin/notifications` page:
 *   - `markAsRead(ids)` — bulk-mark a set of notifications read
 *   - `markAllAsRead()` — zero-arg convenience for the "mark all" button
 *
 * Both revalidate `/admin/*` paths so the shell header badge recomputes.
 */

async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('unauthenticated');
}

function revalidateShell(): void {
  try {
    revalidatePath('/admin/notifications');
    revalidatePath('/admin/inbox');
    revalidatePath('/admin');
  } catch {
    // Non-request contexts — ignore.
  }
}

export async function markAsRead(ids: number[]): Promise<{ updated: number }> {
  await requireAdmin();
  const updated = markAsReadCore(getDb(), ids);
  revalidateShell();
  return { updated };
}

export async function markAllAsRead(): Promise<{ updated: number }> {
  await requireAdmin();
  const updated = markAllAsReadCore(getDb());
  revalidateShell();
  return { updated };
}
