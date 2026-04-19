'use client';

/**
 * StatCard — single cell in the StatsBand grid. Client component so it can
 * animate the value from 0 → target with `requestAnimationFrame` once the
 * card scrolls into view (IntersectionObserver, threshold 0.3, fired once).
 *
 * Honors `prefers-reduced-motion: reduce` by skipping the tween and showing
 * the final value immediately. Null values render as "—" with no animation
 * (used when avg rating has no reviews yet).
 */

import { useEffect, useRef, useState } from 'react';

interface StatCardProps {
  /** Numeric target. `null` renders an em-dash placeholder, no animation. */
  value: number | null;
  label: string;
  /** Optional leading string (e.g. "⭐ "). Not animated. */
  prefix?: string;
  /** Decimal places for the displayed number. */
  decimals?: number;
  /** Tween duration in milliseconds. */
  durationMs?: number;
}

const FALLBACK = '—';

function formatNumber(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

export function StatCard({
  value,
  label,
  prefix = '',
  decimals = 0,
  durationMs = 1200,
}: StatCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState<string>(
    value === null ? FALLBACK : formatNumber(0, decimals),
  );

  useEffect(() => {
    if (value === null) {
      setDisplay(FALLBACK);
      return;
    }

    const node = ref.current;
    if (!node) return;

    // Respect reduced-motion: jump straight to the final value.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(formatNumber(value, decimals));
      return;
    }

    let rafId: number | null = null;
    let cancelled = false;

    const runTween = (): void => {
      const startTime = performance.now();
      const tick = (now: number): void => {
        if (cancelled) return;
        const t = Math.min((now - startTime) / durationMs, 1);
        // Ease-out cubic — fast at the start, gentle landing.
        const eased = 1 - Math.pow(1 - t, 3);
        const current = value * eased;
        setDisplay(formatNumber(current, decimals));
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          // Snap to the exact target so floating-point smear never shows.
          setDisplay(formatNumber(value, decimals));
        }
      };
      rafId = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            runTween();
            break;
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [value, decimals, durationMs]);

  return (
    <div
      ref={ref}
      className="flex flex-col items-center justify-center px-4 py-6 text-center"
    >
      <span
        className="flex h-10 items-center text-4xl font-extrabold leading-none tracking-tight text-[#6C9630]"
        // Tabular-nums keeps width stable while digits change during the tween.
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {prefix}
        {display}
      </span>
      <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </span>
    </div>
  );
}
