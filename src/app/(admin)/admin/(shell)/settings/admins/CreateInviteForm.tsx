'use client';

/**
 * Create-invite form. Email is required; label is optional and bounded by
 * `INVITE_LABEL_MAX_LEN`. On success the created invite URL is displayed
 * for the admin to copy (one-click button); the server component refresh
 * will also drop the new row into the outstanding-invites table above.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateInvite } from '@/features/auth/invites';
import {
  INVITE_LABEL_MAX_LEN,
  buildInviteUrl,
} from '@/features/auth/invites-shared';

export function CreateInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setCreatedUrl(null);
    try {
      const res = await generateInvite({
        email: email.trim(),
        label: label.trim().length > 0 ? label.trim() : undefined,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setCreatedUrl(buildInviteUrl(res.token, origin));
      setEmail('');
      setLabel('');
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
    } catch {
      if (typeof window !== 'undefined') {
        window.prompt('Copy this invite link:', createdUrl);
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
      data-testid="create-invite-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-[hsl(var(--muted-foreground))]">
            Invitee email
          </span>
          <Input
            type="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            data-testid="invite-email-input"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[hsl(var(--muted-foreground))]">
            Label (optional)
          </span>
          <Input
            type="text"
            name="label"
            maxLength={INVITE_LABEL_MAX_LEN}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            data-testid="invite-label-input"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy} data-testid="invite-submit-button">
          {busy ? 'Creating…' : 'Create invite'}
        </Button>
        {error && (
          <p
            className="text-sm text-[hsl(var(--destructive))]"
            role="alert"
            data-testid="invite-error"
          >
            {error}
          </p>
        )}
      </div>

      {createdUrl && (
        <div
          className="rounded-md bg-[hsl(var(--muted))] p-3 text-sm"
          data-testid="created-invite-url"
        >
          <p className="mb-2 text-[hsl(var(--muted-foreground))]">
            Invite link (valid for 24 hours):
          </p>
          <code
            className="block break-all rounded bg-[hsl(var(--background))] px-2 py-1 font-mono text-xs"
            data-testid="invite-url"
          >
            {createdUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={handleCopy}
            data-testid="copy-created-invite"
          >
            Copy link
          </Button>
        </div>
      )}
    </form>
  );
}
