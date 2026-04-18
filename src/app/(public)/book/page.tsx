import Link from 'next/link';
import { getDb } from '@/db';
import type { ServiceRow } from '@/db/schema/services';
import {
  availabilityForCustomer,
  hasAnyAvailability,
  type CustomerDay,
} from '@/features/bookings/availability-for-customer';
import { getActiveServices } from '@/features/bookings/queries';
import { BookingFlow } from '@/components/public/booking/BookingFlow';

/**
 * Public booking page — Phase 5.
 *
 * Server component: loads the full availability payload for the configured
 * horizon, the list of active services, and hands both to the client-side
 * <BookingFlow> which walks the customer through day → slot → form →
 * redirect.
 *
 * Zero-availability case: when no day has any candidate, <BookingFlow>
 * renders the friendly "no openings right now" state; the client never
 * sees an empty picker it can't act on.
 */

// Live DB read every request — availability updates when bookings are
// accepted elsewhere or admin schedule edits land.
export const dynamic = 'force-dynamic';

export default function BookPage() {
  const db = getDb();

  let availability: CustomerDay[] = [];
  let services: ServiceRow[] = [];
  try {
    availability = availabilityForCustomer(db);
    services = getActiveServices();
  } catch {
    // DB not migrated yet or schema mismatch — fall back gracefully.
    availability = [];
    services = [];
  }

  const anyAvailability = hasAnyAvailability(availability);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-green-300 hover:text-green-100"
          >
            &larr; Back to home
          </Link>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Request service</h1>
        <p className="mb-8 text-gray-300">
          Pick a day and time, tell Sawyer about the job, and he&apos;ll confirm.
        </p>

        {services.length === 0 ? (
          <EmptyServicesState />
        ) : !anyAvailability ? (
          <NoOpeningsState />
        ) : (
          <BookingFlow availability={availability} services={services} />
        )}
      </div>
    </main>
  );
}

function EmptyServicesState() {
  return (
    <div className="rounded-lg border border-green-800 bg-green-950/40 p-6 text-center">
      <p className="text-green-200">
        No services listed yet — check back soon.
      </p>
    </div>
  );
}

function NoOpeningsState() {
  return (
    <div
      role="status"
      className="rounded-lg border border-green-800 bg-green-950/40 p-6 text-center"
    >
      <h2 className="mb-2 text-xl font-semibold text-green-100">
        No openings right now
      </h2>
      <p className="text-green-300">
        Sawyer&apos;s schedule is full for the next few weeks — check back
        soon. If the job can&apos;t wait, text him directly from the
        home page.
      </p>
    </div>
  );
}
