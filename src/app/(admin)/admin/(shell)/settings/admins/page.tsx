/**
 * `/admin/settings/admins` — admin roster + invite management (issue #83).
 *
 * Server component. Renders three regions:
 *   1. Current admins table (enrolled + disabled). Actions: enable / disable.
 *   2. Outstanding invites list (pending, used, expired, revoked). Actions
 *      depend on status; see `InvitesList`.
 *   3. Create-invite form.
 *
 * Every mutation is authenticated via the underlying server action;
 * middleware for the admin shell already redirects unauthenticated users
 * to /admin/login, so this page is safe to render.
 */

import { listAdminsForUi } from '@/features/auth/admin-management';
import { listInvitesForUi } from '@/features/auth/invites';
import { headers } from 'next/headers';
import { CreateInviteForm } from './CreateInviteForm';
import { InvitesList } from './InvitesList';
import { AdminsList } from './AdminsList';

export const dynamic = 'force-dynamic';

async function resolveBaseUrl(): Promise<string> {
  const explicit = process.env.BASE_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/+$/, '');

  const h = await headers();
  const proto =
    h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  return host ? `${proto}://${host}` : '';
}

export default async function AdminsSettingsPage() {
  const [admins, invites, baseUrl] = await Promise.all([
    listAdminsForUi(),
    listInvitesForUi(),
    resolveBaseUrl(),
  ]);

  return (
    <div className="space-y-10" data-testid="admins-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admins</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Manage the people who can sign in to this admin shell. Create an
          invite link to onboard someone new; revoke a link that was sent by
          mistake.
        </p>
      </div>

      <section className="space-y-3" data-testid="current-admins-section">
        <h2 className="text-lg font-semibold tracking-tight">Current admins</h2>
        <AdminsList admins={admins} />
      </section>

      <section className="space-y-3" data-testid="outstanding-invites-section">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Outstanding invites</h2>
        </div>
        <InvitesList invites={invites} baseUrl={baseUrl} />
      </section>

      <section className="space-y-3" data-testid="create-invite-section">
        <h2 className="text-lg font-semibold tracking-tight">Create invite</h2>
        <CreateInviteForm />
      </section>
    </div>
  );
}
