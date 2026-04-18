/**
 * `/admin/settings/devices` — per-device passkey management for the
 * currently-authenticated admin.
 *
 * Server component. Reads the devices list via `listMyDevices()` (which
 * enforces that only the session's admin's credentials are returned) and
 * renders:
 *   - Prominent "this device" indicator on the current session's credential
 *   - "Rename" / "Remove" buttons on non-current rows (with a confirm dialog)
 *   - "Add another device" button at the top, which triggers the client-side
 *     WebAuthn registration flow
 *
 * The table intentionally does NOT render a "Remove" button on the current
 * device row. Defense-in-depth: the API also rejects a call to remove the
 * session's own credential (see `removeDevice` in devices.ts).
 */

import { listMyDevices } from '@/features/auth/devices';
import { AddDeviceButton } from './AddDeviceButton';
import { DeviceRow } from './DeviceRow';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default async function DevicesPage() {
  const devices = await listMyDevices();

  return (
    <div className="space-y-6" data-testid="devices-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Passkeys registered for your admin account. Add a device for each
            phone, tablet, or computer you want to sign in from.
          </p>
        </div>
        <AddDeviceButton />
      </div>

      <div
        className="overflow-hidden rounded-md border border-[hsl(var(--border))]"
        data-testid="devices-table"
      >
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--muted))] text-left text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Added</th>
              <th className="px-4 py-2 font-medium">This device</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-[hsl(var(--muted-foreground))]"
                  data-testid="devices-empty"
                >
                  No devices registered.
                </td>
              </tr>
            ) : (
              devices.map((d) => (
                <DeviceRow
                  key={d.id}
                  device={d}
                  addedLabel={formatDate(d.createdAt)}
                  canRemove={devices.length > 1}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        You can&rsquo;t remove the passkey you used to sign in — switch to
        another device first. You also can&rsquo;t remove your last remaining
        passkey (that would lock you out).
      </p>
    </div>
  );
}
