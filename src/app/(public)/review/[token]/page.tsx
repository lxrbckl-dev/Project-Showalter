import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getDb } from '@/db';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { getReviewByToken } from '@/features/reviews/queries';
import { ReviewForm } from './_components/ReviewForm';

/**
 * Public customer review page — Phase 9.
 *
 * Tokenized, no-login surface where the customer submits their review. The
 * token is the 128-bit UUID stored on the `reviews` row (created by the
 * admin "Request review" action). Three render paths:
 *
 *   - Unknown token            → 404 (vague — same body as any other 404,
 *                                per the STACK.md no-enumeration rule).
 *   - Known token, pending     → star-rating + text + photo upload form.
 *   - Known token, submitted   → "Thanks for your review!" terminal state.
 *
 * This is a server component; it only reads the DB and hands the token +
 * upload caps to the client-side <ReviewForm>. The submit action itself
 * lives in `src/features/reviews/submit.ts` and is invoked from the form.
 */

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const db = getDb();
  const review = getReviewByToken(db, token);
  if (!review) notFound();

  const cfg = db.select().from(siteConfigTable).limit(1).all()[0];
  const maxPhotos = cfg?.maxBookingPhotos ?? 3;
  const maxBytes = cfg?.bookingPhotoMaxBytes ?? 10_485_760;
  const host = cfg?.ownerFirstName?.trim() || 'Sawyer';

  const customerName = review.customerName ?? 'there';

  if (review.status === 'submitted') {
    return (
      <main
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center bg-black px-6 py-16 text-center text-white"
        data-testid="review-thankyou"
      >
        <h1 className="text-3xl font-bold">Thanks for your review!</h1>
        <p className="mt-4 text-green-300">
          Your feedback has been submitted. {host} appreciates it.
        </p>
        {review.rating !== null && (
          <p className="mt-6 text-lg" data-testid="review-rating-display">
            You gave {'★'.repeat(review.rating ?? 0)}
            {'☆'.repeat(5 - (review.rating ?? 0))}
          </p>
        )}
        <Image
          src="/logo_secondary.png"
          alt=""
          width={110}
          height={110}
          className="mt-10 h-auto w-auto max-w-[110px] opacity-70"
        />
      </main>
    );
  }

  // Pending → show the form.
  return (
    <main
      className="mx-auto w-full max-w-xl flex-1 bg-black px-6 py-12 text-white"
      data-testid="review-form-page"
    >
      <h1 className="text-3xl font-bold">Leave a review</h1>
      <p className="mt-2 text-green-300">
        Hi {customerName} — thanks for letting {host} work on your service!
        How did it go?
      </p>
      <div className="mt-8">
        <ReviewForm
          token={token}
          maxPhotos={maxPhotos}
          maxBytes={maxBytes}
        />
      </div>
      <div className="mt-10 flex justify-center">
        <Image
          src="/logo_secondary.png"
          alt=""
          width={110}
          height={110}
          className="h-auto w-auto max-w-[110px] opacity-70"
        />
      </div>
    </main>
  );
}
