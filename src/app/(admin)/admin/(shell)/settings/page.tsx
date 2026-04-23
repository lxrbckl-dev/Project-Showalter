/**
 * `/admin/settings` — site-wide configuration + admin-account links.
 *
 * The site_config form (booking knobs, photo caps, landing-stats toggles,
 * timezone, host-facts marquee, etc.) lives here. The /admin/content tab
 * for "Settings" was removed in favor of this page so site configuration
 * is reachable from a top-level nav entry instead of nested inside Content.
 *
 * Account-level surfaces (passkeys / devices) sit in a small index above
 * the form. They're discoverable without competing with the sticky save
 * footer pinned to the form's bottom.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth';
import { getSiteConfig } from '@/features/site-config/queries';
import { SettingsForm } from '@/components/admin/content/SettingsForm';

export const metadata = { title: 'Settings — Showalter Admin' };

type AccountEntry = {
  href: string;
  label: string;
  description: string;
  testId: string;
};

const ACCOUNT_ENTRIES: AccountEntry[] = [
  {
    href: '/admin/settings/devices',
    label: 'Devices',
    description: 'Manage the passkeys you use to sign in.',
    testId: 'settings-devices-link',
  },
  {
    href: '/admin/settings/admins',
    label: 'Admins',
    description: 'Invite and manage the people who can sign in.',
    testId: 'settings-admins-link',
  },
];

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session) redirect('/admin/login');

  const config = await getSiteConfig();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Site configuration and admin-account preferences.
        </p>
      </section>

      <section aria-label="Account">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Account
        </h2>
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {ACCOUNT_ENTRIES.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="block px-4 py-3 hover:bg-[hsl(var(--accent))]"
                data-testid={entry.testId}
              >
                <div className="font-medium">{entry.label}</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  {entry.description}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Site configuration">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Site configuration
        </h2>
        {config ? (
          <SettingsForm config={config} />
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Site config not found. Run migrations and seed the database.
          </p>
        )}
      </section>
    </div>
  );
}
