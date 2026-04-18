'use client';

/**
 * Revoke-invite button. Calls `revokeInvite` server action after a confirm
 * dialog, then refreshes the server component.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { revokeInvite } from '@/features/auth/invites';

type Props = {
  token: string;
};

export function RevokeButton({ token }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick() {
    if (busy) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Revoke this invite? The link will stop working immediately and the invitee will need a new invite.',
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      await revokeInvite(token);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={busy}
      data-testid="revoke-invite-button"
    >
      {busy ? 'Revoking…' : 'Revoke'}
    </Button>
  );
}
