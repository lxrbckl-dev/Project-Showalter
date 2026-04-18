import { getDb, getSqlite } from '@/db';

// This page reads live from the SQLite database — disable static pre-rendering.
export const dynamic = 'force-dynamic';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import { services as servicesTable } from '@/db/schema/services';
import { eq, asc } from 'drizzle-orm';
import { Hero } from '@/components/public/Hero';
import { About } from '@/components/public/About';
import { Gallery } from '@/components/public/Gallery';
import { Services } from '@/components/public/Services';
import { RepeatCTA } from '@/components/public/RepeatCTA';
import { Contact } from '@/components/public/Contact';
import { Footer } from '@/components/public/Footer';

/**
 * Public landing page — server component.
 *
 * Reads live from the database. Section order follows PHASES.md Phase 2:
 *   1. Hero
 *   2. (Stats widget — Phase 11, skipped)
 *   3. About
 *   4. Gallery  (gracefully absent until Phase 3 adds site_photos)
 *   5. Services
 *   6. RepeatCTA
 *   7. #request anchor placeholder (Phase 5 booking flow)
 *   8. Contact
 *   9. Footer
 *
 * Gallery queries `site_photos` — the table doesn't exist until Phase 3.
 * The query is wrapped in try/catch to handle the missing table gracefully.
 */

interface SitePhoto {
  id: number;
  path: string;
  caption: string | null;
}

function fetchGalleryPhotos(): SitePhoto[] {
  try {
    const sqlite = getSqlite();
    // Runtime check: does the table exist yet? (site_photos is added in Phase 3)
    const tableCheck = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='site_photos'")
      .get() as { name: string } | undefined;

    if (!tableCheck) return [];

    const rows = sqlite
      .prepare(
        'SELECT id, file_path AS path, caption FROM site_photos WHERE active = 1 ORDER BY sort_order ASC',
      )
      .all() as SitePhoto[];

    // Prefix with /uploads/ so Next.js Image can serve from the route handler
    return rows.map((r) => ({ ...r, path: `/uploads/${r.path}` }));
  } catch {
    return [];
  }
}

export default function HomePage() {
  const db = getDb();

  // Load site config (single row)
  const configs = db.select().from(siteConfigTable).limit(1).all();
  const config = configs[0] ?? null;

  // Load active services ordered by sort_order
  const activeServices = db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.active, 1))
    .orderBy(asc(servicesTable.sortOrder))
    .all();

  // Load gallery photos (Phase 3 — may not exist yet)
  const photos = fetchGalleryPhotos();

  if (!config) {
    // Defensive: DB not yet migrated or site_config row missing
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-lg text-gray-400">Site is being set up — check back soon.</p>
      </main>
    );
  }

  return (
    <main>
      {/* 1. Hero */}
      <Hero siteConfig={config} />

      {/* 2. Stats widget — Phase 11, skipped */}

      {/* 3. About */}
      <About siteConfig={config} />

      {/* 4. Gallery — gracefully absent until Phase 3 */}
      <Gallery photos={photos} />

      {/* 5. Services */}
      <Services services={activeServices} />

      {/* 6. Repeat CTA */}
      <RepeatCTA />

      {/*
        7. #request anchor — Phase 5 booking flow. The full multi-step form
        lives at /book (dedicated route); this section is a compact visual
        anchor + CTA on the landing page so the "Request service" links at
        the top and in the hero still have somewhere meaningful to scroll to
        for users who landed on the page with #request in the URL.
      */}
      <section
        id="request"
        className="bg-green-950 px-6 py-16 text-center text-white"
        aria-label="Request service"
      >
        <h2 className="mb-3 text-2xl font-bold">Request a Service</h2>
        <p className="mb-6 text-green-300">
          Pick a day and time, tell Sawyer about the job.
        </p>
        <a
          href="/book"
          className="inline-block rounded-md bg-green-600 px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          Start booking
        </a>
      </section>

      {/* 8. Contact */}
      <Contact siteConfig={config} />

      {/* 9. Footer */}
      <Footer siteConfig={config} />
    </main>
  );
}
