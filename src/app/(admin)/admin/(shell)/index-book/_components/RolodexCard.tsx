'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import { formatUSPhone } from '@/lib/formatters/phone';

interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
}

interface RolodexCardProps {
  customer: Customer;
  totalBookings: number;
  lastBookingLabel: string;
}

// Hold this long for the contextual menu to open instead of navigating.
const LONG_PRESS_MS = 500;

/**
 * Mobile rolodex card.
 *
 * Tap = navigate to the customer detail page (preserves Link semantics so
 * right-click / middle-click / cmd-click still open in new tab).
 *
 * Long-press = open a native <dialog> with copy actions for phone/email.
 * iOS's long-press preview sheet is suppressed via `-webkit-touch-callout`
 * and the timer-driven preventDefault on the click event.
 */
export function RolodexCard({ customer, totalBookings, lastBookingLabel }: RolodexCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const [copied, setCopied] = useState<'phone' | 'email' | null>(null);

  function startTimer(): void {
    longPressedRef.current = false;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      dialogRef.current?.showModal();
    }, LONG_PRESS_MS);
  }

  function cancelTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>): void {
    // If the long-press already fired and opened the dialog, suppress the
    // click that would otherwise navigate to the detail page.
    if (longPressedRef.current) {
      e.preventDefault();
      longPressedRef.current = false;
    }
  }

  async function copy(value: string, kind: 'phone' | 'email'): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // Clipboard write rejected (e.g., iframe permissions) — silent no-op.
    }
  }

  function closeDialog(): void {
    setCopied(null);
    dialogRef.current?.close();
  }

  return (
    <>
      <Link
        href={`/admin/index-book/${customer.id}`}
        onClick={handleClick}
        onMouseDown={startTimer}
        onMouseUp={cancelTimer}
        onMouseLeave={cancelTimer}
        onTouchStart={startTimer}
        onTouchEnd={cancelTimer}
        onTouchMove={cancelTimer}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="index-book-card"
        data-customer-id={customer.id}
        className="block select-none rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 [-webkit-touch-callout:none] hover:bg-[hsl(var(--accent))]"
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            className="min-w-0 truncate font-medium text-[hsl(var(--foreground))]"
            data-testid="index-book-card-name"
          >
            {customer.name}
          </h3>
          <span
            className="shrink-0 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium tabular-nums text-[hsl(var(--foreground))]"
            data-testid="index-book-card-bookings"
            aria-label={`${totalBookings} bookings`}
          >
            {totalBookings} {totalBookings === 1 ? 'booking' : 'bookings'}
          </span>
        </div>
        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          {formatUSPhone(customer.phone)}
          {customer.email ? ` · ${customer.email}` : ''}
        </div>
        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Last booking: {lastBookingLabel}
        </div>
      </Link>

      <dialog
        ref={dialogRef}
        data-testid="rolodex-card-dialog"
        // Backdrop click closes via the onClick on the dialog itself —
        // clicks on inner content stop propagation so the menu stays open.
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
        onClose={() => setCopied(null)}
        className="fixed top-1/2 left-1/2 w-[min(20rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 text-[hsl(var(--foreground))] shadow-xl backdrop:bg-black/40"
      >
        <div className="space-y-3 p-4">
          <header>
            <h2 className="text-base font-semibold" data-testid="rolodex-dialog-name">
              {customer.name}
            </h2>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              Tap to copy
            </p>
          </header>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => copy(customer.phone, 'phone')}
              data-testid="rolodex-copy-phone"
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--accent))]"
            >
              <span className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Phone
                </span>
                <span className="font-medium tabular-nums">
                  {formatUSPhone(customer.phone)}
                </span>
              </span>
              <span
                className="shrink-0"
                aria-label={copied === 'phone' ? 'Copied' : 'Copy phone'}
              >
                {copied === 'phone' ? (
                  <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                )}
              </span>
            </button>

            {customer.email && (
              <button
                type="button"
                onClick={() => copy(customer.email!, 'email')}
                data-testid="rolodex-copy-email"
                className="flex w-full items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-left text-sm hover:bg-[hsl(var(--accent))]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Email
                  </span>
                  <span className="truncate font-medium">{customer.email}</span>
                </span>
                <span
                  className="shrink-0"
                  aria-label={copied === 'email' ? 'Copied' : 'Copy email'}
                >
                  {copied === 'email' ? (
                    <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  )}
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={closeDialog}
            data-testid="rolodex-dialog-close"
            className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))]"
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
