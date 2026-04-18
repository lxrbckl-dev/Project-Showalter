'use client';

/**
 * One row in the devices table.
 *
 * - "This device" row: shows a badge, hides the Remove button. Rename is
 *   still allowed.
 * - Non-current rows: show Rename (inline input) and Remove (confirm dialog).
 *
 * The parent also passes `canRemove` — false when there's only one device,
 * so we never even offer the option UI-side. The server-side `removeDevice`
 * action still re-checks the last-device + is-current-device guards.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { removeDevice, renameDevice } from '@/features/auth/devices';
import { LABEL_MAX_LEN, type DeviceView } from '@/features/auth/devices-shared';

type Props = {
  device: DeviceView;
  addedLabel: string;
  canRemove: boolean;
};

export function DeviceRow({ device, addedLabel, canRemove }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(device.label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const displayName = device.label ?? device.deviceType ?? '(unnamed device)';
  const showRemove = canRemove && !device.isThisDevice;

  async function saveLabel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await renameDevice(device.credentialId, labelDraft);
      if (!res.ok) {
        setError(res.message ?? 'Could not rename device.');
        return;
      }
      setEditing(false);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (busy) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Remove "${displayName}"? You won't be able to sign in from that device again unless you add it back.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await removeDevice(device.credentialId);
      if (!res.ok) {
        const msg =
          res.reason === 'last_device'
            ? 'Cannot remove your only passkey.'
            : res.reason === 'is_current_device'
              ? 'Cannot remove the device you are currently using.'
              : 'Could not remove device.';
        setError(msg);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr
      className="border-t border-[hsl(var(--border))]"
      data-testid="device-row"
      data-credential-id={device.credentialId}
      data-this-device={device.isThisDevice ? 'true' : 'false'}
    >
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              maxLength={LABEL_MAX_LEN}
              disabled={busy}
              data-testid="rename-input"
              aria-label="Device label"
            />
            <Button
              type="button"
              size="sm"
              onClick={saveLabel}
              disabled={busy}
              data-testid="rename-save"
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setLabelDraft(device.label ?? '');
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <span data-testid="device-label">{displayName}</span>
        )}
        {error && (
          <p
            className="mt-1 text-xs text-[hsl(var(--destructive))]"
            role="alert"
            data-testid="device-error"
          >
            {error}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
        {device.deviceType ?? '—'}
      </td>
      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{addedLabel}</td>
      <td className="px-4 py-3">
        {device.isThisDevice ? (
          <Badge data-testid="this-device-badge">This device</Badge>
        ) : (
          <span className="text-[hsl(var(--muted-foreground))]">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          {!editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={busy}
              data-testid="rename-button"
            >
              Rename
            </Button>
          )}
          {showRemove && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRemove}
              disabled={busy}
              data-testid="remove-button"
            >
              Remove
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
