/**
 * `/admin/settings` — top-level settings hub.
 *
 * Single-admin install — no roster management. The Devices entry is the
 * only sub-section here; left as a list for forward extensibility (so a
 * future entry can drop in next to it).
 */

import Link from 'next/link';

type Entry = {
  href: string;
  label: string;
  description: string;
  testId: string;
};

const ENTRIES: Entry[] = [
  {
    href: '/admin/settings/devices',
    label: 'Devices',
    description: 'Manage the passkeys you use to sign in.',
    testId: 'settings-devices-link',
  },
];

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
        {ENTRIES.map((entry) => (
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
    </div>
  );
}
