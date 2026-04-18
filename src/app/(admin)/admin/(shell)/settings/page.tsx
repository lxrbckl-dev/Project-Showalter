/**
 * `/admin/settings` — top-level settings hub.
 *
 * For MVP this is a thin index that lists sub-sections. Currently only the
 * Devices manager is wired up (issue #77). Future settings (notification
 * preferences, stats toggles, etc.) hang off this page.
 */

import Link from 'next/link';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Admin-account preferences and security.
        </p>
      </div>

      <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
        <li>
          <Link
            href="/admin/settings/devices"
            className="block px-4 py-3 hover:bg-[hsl(var(--accent))]"
            data-testid="settings-devices-link"
          >
            <div className="font-medium">Devices</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              Manage the passkeys you use to sign in.
            </div>
          </Link>
        </li>
      </ul>
    </div>
  );
}
