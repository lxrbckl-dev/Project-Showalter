'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import { customers } from '@/db/schema/customers';
import { reviews } from '@/db/schema/reviews';
import { composeReviewRequest } from './compose';

/**
 * Server-action wrapper around `composeReviewRequest` — Phase 9.
 *
 * Client components (e.g. the StandaloneReviewWidget in /admin/inbox) need
 * to obtain the mailto: / sms: hrefs after they create a new review row.
 * The pure compose helper takes a reviewId; this wrapper guards the call
 * with the admin session and returns both the email and SMS hrefs in one
 * round trip (the widget can show whichever has a valid target for the
 * customer).
 */

export interface StandaloneComposed {
  reviewId: number;
  customerName: string;
  reviewLink: string;
  emailHref: string | null;
  smsHref: string | null;
}

export type ComposeActionResult =
  | { ok: true; composed: StandaloneComposed }
  | { ok: false; error: string };

export async function composeStandaloneReview(
  reviewId: number,
): Promise<ComposeActionResult> {
  const session = await auth();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const db = getDb();
  const row = db
    .select()
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1)
    .all()[0];
  if (!row) return { ok: false, error: 'Review not found.' };

  const customer = db
    .select()
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1)
    .all()[0];
  if (!customer) return { ok: false, error: 'Customer not found.' };

  const baseUrl = (process.env.BASE_URL ?? 'https://showalter.business').replace(
    /\/+$/,
    '',
  );
  const reviewLink = `${baseUrl}/review/${row.token}`;

  let emailHref: string | null = null;
  let smsHref: string | null = null;

  const email = composeReviewRequest(reviewId, 'review_request_email');
  if (email.ok && email.email) emailHref = email.email.href;

  const sms = composeReviewRequest(reviewId, 'review_request_sms');
  if (sms.ok && sms.sms) smsHref = sms.sms.href;

  return {
    ok: true,
    composed: {
      reviewId,
      customerName: customer.name,
      reviewLink,
      emailHref,
      smsHref,
    },
  };
}
