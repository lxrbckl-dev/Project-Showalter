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
import { Contact } from '@/components/public/Contact';
import { StatsBand } from '@/components/public/StatsBand';

/**
 * Public landing page — server component.
 *
 * Reads live from the database. Section order:
 *   1. Hero
 *   2. Stats widget (Phase 11)
 *   3. About
 *   4. Services
 *   5. Request (booking CTA)
 *   6. Contact
 *   7. Reviews / Gallery (gracefully absent until Phase 3 adds site_photos)
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
    <main className="w-full">
      {/* 1. Hero */}
      <Hero siteConfig={config} />

      {/* 2. Stats widget — Phase 11 */}
      <StatsBand />

      {/* 3. About */}
      <About siteConfig={config} />

      {/* 4. Services */}
      <Services services={activeServices} />

      {/* 5. #request anchor — booking CTA */}
      <section
        id="request"
        className="bg-gray-50 px-6 py-8 text-center"
        aria-label="Request service"
      >
        <h2 className="mb-3 text-3xl font-bold text-gray-900 md:text-4xl">Request Service</h2>
        <p className="mb-6 text-gray-600">
          Pick a day and time, tell Sawyer about the job.
        </p>
        <a
          href="/book"
          className="inline-block rounded-md bg-[#6C9630] px-8 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-[#567826] focus:outline-none focus:ring-2 focus:ring-[#6C9630]"
        >
          Start booking
        </a>
      </section>

      {/* 6. Contact */}
      <Contact siteConfig={config} />

      {/* 7. Reviews — gracefully absent until Phase 3 */}
      <Gallery photos={photos} siteTitle={config.siteTitle} />
    </main>
  );
}
