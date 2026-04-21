'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Icon-only copy-to-clipboard button. Swaps to a green check for 2s after a
 * successful copy. Renders a square button so it sits flush alongside the
 * adjacent Open SMS / Open email action buttons in the same flex row.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const label = copied ? 'Copied!' : 'Copy link';

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="copy-review-link"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[hsl(var(--border))] transition-colors hover:bg-[hsl(var(--accent))]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
