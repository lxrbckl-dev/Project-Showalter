import { getDb } from '@/db';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { getAllServices } from '@/features/services/queries';
import { searchCustomers } from '@/features/customers/queries';
import { WalkInForm } from './_components/WalkInForm';

/**
 * Admin walk-in booking page — Phase 6.
 *
 * Server component wrapper around the client-side walk-in form. Pulls in the
 * site timezone, the active service list, and a starting search result
 * (recent customers) so the form opens with useful defaults without an
 * additional round-trip.
 *
 * Status semantics (STACK.md § Admin-initiated bookings):
 *   - Every submission lands at `status='accepted'`.
 *   - Spacing + advance-notice are warnings, not hard blocks. The server
 *     action returns `kind: 'warnings'` when either fires; the UI surfaces
 *     the banner and enables a "Submit anyway" button that re-sends with
 *     `force=true`.
 */

export const dynamic = 'force-dynamic';

export default async function AdminNewBookingPage() {
  const db = getDb();
  const cfg = db
    .select({ timezone: siteConfigTable.timezone })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  const tz = cfg?.timezone ?? 'America/Chicago';

  const services = getAllServices().filter((s) => s.active === 1);
  // Fetch the full customer list (cap at 1000) so the WalkInForm combobox
  // can filter client-side as the admin types. A single-person business
  // realistically has hundreds at most over many years; if this ever grows
  // past the cap, swap to debounced server-side search.
  const recentCustomers = searchCustomers(db, '', 1000);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Booking</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Create a walk-in / phone-call booking. Status starts at{' '}
          <strong>accepted</strong>. Advance-notice and spacing checks are
          warnings, not hard blocks.
        </p>
      </header>
      <WalkInForm
        timezone={tz}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        initialCustomers={recentCustomers.map((r) => ({
          id: r.customer.id,
          name: r.customer.name,
          phone: r.customer.phone,
          email: r.customer.email,
          primaryAddress: r.primaryAddress,
        }))}
      />
    </div>
  );
}
