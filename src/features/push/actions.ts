'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import {
  hasSubscriptionForEndpoint,
  subscribePushCore,
  unsubscribePushCore,
  type SubscribeResult,
  type UnsubscribeResult,
} from './subscribe-core';

/**
 * Web Push subscribe / unsubscribe server actions — Phase 8A.
 *
 * Thin wrappers around the pure core in `subscribe-core.ts`. All three
 * require an authenticated admin session — returning `admin_not_found` on
 * unauthenticated calls is a belt-and-braces check; Next's middleware
 * should already have redirected to /admin/login before we get here.
 */

async function requireAdminEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user.email ?? null;
}

function revalidateAdmin(): void {
  try {
    revalidatePath('/admin');
    revalidatePath('/admin/notifications');
  } catch {
    // Non-request contexts (CLI, tests) — ignore.
  }
}

export async function subscribeToPush(
  input: unknown,
): Promise<SubscribeResult> {
  const email = await requireAdminEmail();
  if (!email) return { ok: false, kind: 'admin_not_found' };

  // Capture the user agent for the devices-listing UI. Never logged.
  let userAgent: string | null = null;
  try {
    const h = await headers();
    userAgent = h.get('user-agent');
  } catch {
    // Outside request scope — skip.
  }

  const result = subscribePushCore({
    db: getDb(),
    adminEmail: email,
    input,
    userAgent,
  });
  if (result.ok) revalidateAdmin();
  return result;
}

export async function unsubscribeFromPush(
  endpoint: string,
): Promise<UnsubscribeResult> {
  const email = await requireAdminEmail();
  if (!email) return { ok: false, kind: 'not_found' };
  const result = unsubscribePushCore({
    db: getDb(),
    adminEmail: email,
    endpoint,
  });
  if (result.ok) revalidateAdmin();
  return result;
}

/**
 * Server-side read used by the <PushSubscribeButton> client component to
 * render the correct initial state (button label, disabled state). The
 * client passes the PushSubscription endpoint it learned from the browser.
 */
export async function isPushSubscribed(endpoint: string): Promise<boolean> {
  const email = await requireAdminEmail();
  if (!email) return false;
  return hasSubscriptionForEndpoint({
    db: getDb(),
    adminEmail: email,
    endpoint,
  });
}
