'use client';

/**
 * WikiToc — sticky left-rail navigation for the wiki page.
 *
 * Receives the heading list extracted server-side and renders it as a tree of
 * anchor links. Tracks which heading is currently in view via
 * IntersectionObserver and applies an "active" highlight to the matching
 * link, so the reader always knows where they are. Clicking a link uses
 * normal anchor behavior (the browser handles smooth-scrolling per the
 * `scroll-behavior: smooth` declared in `.wiki-content` styles).
 */

import { useEffect, useRef, useState } from 'react';

export interface WikiHeading {
  /** Heading depth (1 = h1, 2 = h2, 3 = h3, etc.). Only 1–3 included. */
  level: number;
  /** Visible text of the heading. */
  text: string;
  /** Slug ID — must match the `id` attribute on the rendered heading. */
  id: string;
}

interface WikiTocProps {
  headings: WikiHeading[];
}

export function WikiToc({ headings }: WikiTocProps) {
  const [activeId, setActiveId] = useState<string | null>(
    headings[0]?.id ?? null,
  );
  const visibleIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (headings.length === 0) return;

    const elements: HTMLElement[] = [];
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

    const visibleIds = visibleIdsRef.current;
    const order = headings.map((h) => h.id);
    const orderIndex = new Map(order.map((id, i) => [id, i]));

    const pickActive = (): void => {
      // Of all currently-visible headings, the first one in document order
      // is the one we treat as "active". Falls back to the last heading
      // scrolled past when nothing is visible.
      let bestIdx = -1;
      for (const id of visibleIds) {
        const idx = orderIndex.get(id);
        if (idx !== undefined && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
      }
      if (bestIdx === -1) return;
      setActiveId(order[bestIdx]);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visibleIds.add(id);
          else visibleIds.delete(id);
        }
        pickActive();
      },
      // Top margin pushes the "active line" down ~20% from the top so
      // headings register as active when they're approaching the top, not
      // when they're already off-screen.
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Wiki contents" className="wiki-toc text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
        Contents
      </p>
      <ul className="space-y-1">
        {headings.map((h) => {
          const isActive = h.id === activeId;
          const indentClass =
            h.level === 1 ? 'pl-0 font-semibold' : h.level === 2 ? 'pl-3' : 'pl-6 text-xs';
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'block rounded px-2 py-1 transition-colors',
                  indentClass,
                  isActive
                    ? 'bg-[hsl(var(--accent))] text-[#6C9630]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
                ].join(' ')}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
