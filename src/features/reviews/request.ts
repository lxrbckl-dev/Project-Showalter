'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import { bookings } from '@/db/schema/bookings';
import { customers } from '@/db/schema/customers';
import { reviews } from '@/db/schema/reviews';
import { findPendingReviewForBooking } from './queries';

/**
 * Admin "Request review" server actions — Phase 9.
 *
 * Two variants, both admin-guarded:
 *   - `requestReviewForBooking(bookingId)`  — normal flow from the
 *     /admin/inbox needs-attention queue (after the booking is marked
 *     `completed`). Idempotent: if a pending review for this booking
 *     already exists, returns the existing token.
 *   - `requestStandaloneReview(customerId)` — fires from /admin/index-book
 *     (or /admin/inbox top-level action) for pre-app customers. Always
 *     creates a fresh row with booking_id=NULL; a customer may have
 *     several standalone pending reviews outstanding at once.
 *
 * Neither action dispatches the email / SMS — the admin UI opens a
 * prefilled `mailto:` / `sms:` via the Phase 7 template helper. This
 * action only creates the DB row and hands back `{ token, reviewId }`.
 */

export type RequestResult =
  | { ok: true; reviewId: number; token: string; customerId: number; reused: boolean }
  | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session !== null;
}

export async function requestReviewForBooking(
  bookingId: number,
): Promise<RequestResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'unauthenticated' };

  const db = getDb();
  const booking = db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
    .all()[0];
  if (!booking) {
    return { ok: false, error: 'Booking not found.' };
  }
  if (booking.status !== 'completed') {
    return {
      ok: false,
      error: 'Review requests can only be sent after the booking is completed.',
    };
  }

  const existing = findPendingReviewForBooking(db, bookingId);
  if (existing) {
    return {
      ok: true,
      reviewId: existing.id,
      token: existing.token,
      customerId: existing.customerId,
      reused: true,
    };
  }

  const token = randomUUID();
  const nowIso = new Date().toISOString();
  const inserted = db
    .insert(reviews)
    .values({
      bookingId: booking.id,
      customerId: booking.customerId,
      token,
      status: 'pending',
      requestedAt: nowIso,
    })
    .returning()
    .all()[0];

  try {
    revalidatePath(`/admin/inbox/${bookingId}`);
    revalidatePath('/admin/reviews');
  } catch {
    // ignore
  }

  return {
    ok: true,
    reviewId: inserted.id,
    token: inserted.token,
    customerId: inserted.customerId,
    reused: false,
  };
}

export async function requestStandaloneReview(
  customerId: number,
): Promise<RequestResult> {
  if (!(await requireAdmin())) return { ok: false, error: 'unauthenticated' };

  const db = getDb();
  const customer = db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)
    .all()[0];
  if (!customer) {
    return { ok: false, error: 'Customer not found.' };
  }

  const token = randomUUID();
  const nowIso = new Date().toISOString();
  const inserted = db
    .insert(reviews)
    .values({
      bookingId: null,
      customerId,
      token,
      status: 'pending',
      requestedAt: nowIso,
    })
    .returning()
    .all()[0];

  try {
    revalidatePath('/admin/inbox');
    revalidatePath('/admin/reviews');
  } catch {
    // ignore
  }

  return {
    ok: true,
    reviewId: inserted.id,
    token: inserted.token,
    customerId: inserted.customerId,
    reused: false,
  };
}
