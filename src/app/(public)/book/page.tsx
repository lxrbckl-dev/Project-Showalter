import { getDb } from '@/db';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
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

  const cfg = db
    .select({ ownerFirstName: siteConfigTable.ownerFirstName })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const host = cfg?.ownerFirstName?.trim() || 'Sawyer';

  const anyAvailability = hasAnyAvailability(availability);

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="mx-auto flex w-full min-h-0 max-w-2xl flex-1 flex-col px-6 py-6">
        {services.length === 0 ? (
          <>
            <h1 className="mb-1 text-3xl font-bold tracking-tight text-gray-900">Request service</h1>
            <p className="mb-4 text-gray-600">
              Pick a day and time, tell {host} about the job, and he&apos;ll confirm.
            </p>
            <EmptyServicesState />
          </>
        ) : !anyAvailability ? (
          <>
            <h1 className="mb-1 text-3xl font-bold tracking-tight text-gray-900">Request service</h1>
            <p className="mb-4 text-gray-600">
              Pick a day and time, tell {host} about the job, and he&apos;ll confirm.
            </p>
            <NoOpeningsState host={host} />
          </>
        ) : (
          <BookingFlow
            availability={availability}
            services={services}
            ownerFirstName={cfg?.ownerFirstName ?? null}
          />
        )}
      </div>
    </main>
  );
}

function EmptyServicesState() {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
      <p className="text-green-800">
        No services listed yet — check back soon.
      </p>
    </div>
  );
}

function NoOpeningsState({ host }: { host: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-green-200 bg-green-50 p-6 text-center"
    >
      <h2 className="mb-2 text-xl font-semibold text-green-800">
        No openings right now
      </h2>
      <p className="text-green-700">
        {host}&apos;s schedule is full for the next few weeks — check back
        soon. If the job can&apos;t wait, text him directly from the
        home page.
      </p>
    </div>
  );
}
