'use client';

/**
 * Copy-to-clipboard button for a pending invite URL. Silently falls back to
 * showing the URL in a browser prompt if navigator.clipboard is unavailable
 * (e.g. non-HTTPS admin shell in dev).
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  url: string;
};

export function CopyInviteButton({ url }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (typeof window !== 'undefined') {
        window.prompt('Copy this invite link:', url);
      }
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      data-testid="copy-invite-button"
      data-url={url}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </Button>
  );
}
