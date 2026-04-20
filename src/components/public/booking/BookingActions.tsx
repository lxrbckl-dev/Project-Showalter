'use client';

import { useState } from 'react';
import { Calendar, Check, Copy } from 'lucide-react';

/**
 * Customer-facing action buttons on `/bookings/<token>`:
 *   - "Copy link" — writes the current URL to the clipboard so the customer
 *     can paste it into Notes / a text-thread / wherever and come back to
 *     check status (or cancel) later.
 *   - "Add to my schedule" — direct link to `/bookings/<token>/ics`, the
 *     existing route that returns a `text/calendar` payload. Tapping it on
 *     iOS / Android opens the native calendar app; on desktop it downloads
 *     and offers to open in the user's default calendar.
 *
 * Both are best-effort — `navigator.clipboard.writeText` requires a secure
 * context (https or localhost) but the form action it powers is itself
 * gated behind the same context, so this is consistent.
 */
export function BookingActions({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyLink(): Promise<void> {
    setError(null);
    try {
      const url =
        typeof window !== 'undefined' ? window.location.href : '';
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Long-press the URL to copy manually.');
    }
  }

  return (
    <div data-testid="booking-actions" className="space-y-3">
      <p className="text-sm text-gray-600">
        Save this booking so you can come back any time to check its status,
        cancel it, or add it to your calendar.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <button
            type="button"
            onClick={copyLink}
            data-testid="copy-link"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy link
              </>
            )}
          </button>
          <p className="mt-1 text-xs text-gray-500">
            Paste it into Notes or a text so you can come back to this page
            later.
          </p>
        </div>
        <div>
          <a
            href={`/bookings/${token}/ics`}
            download
            data-testid="add-to-calendar"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" /> Add to my
            schedule
          </a>
          <p className="mt-1 text-xs text-gray-500">
            Drops this appointment into your phone&apos;s default calendar
            app.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
