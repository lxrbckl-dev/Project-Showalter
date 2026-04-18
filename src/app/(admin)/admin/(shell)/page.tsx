/**
 * Admin dashboard — minimal Phase 1B landing after auth.
 *
 * Real dashboard content (Needs-attention queue, cron health, etc.) lands
 * in Phase 6.
 */

import { auth } from '@/features/auth/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AdminDashboardPage() {
  // `auth()` is already enforced by the layout, but we re-read so the page
  // has a typed email for the welcome line without prop-drilling.
  const session = await auth();
  const email = session?.user.email ?? '';

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {email}.</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Your admin dashboard. The rest of this surface fills in over
          subsequent phases.
        </p>
      </section>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Pending bookings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold" data-testid="pending-count">
            0
          </div>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Real data wires up in Phase 5.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
