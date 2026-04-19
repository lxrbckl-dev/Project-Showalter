import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { isNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { siteConfig } from '@/db/schema/site-config';
import { services } from '@/db/schema/services';
import { sitePhotos } from '@/db/schema/site-photos';
import type * as schema from '@/db/schema';

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Sawyer's five services from the brief, in display order.
 * Prices in cents; NULL means "Contact for pricing".
 */
const BRIEF_SERVICES: Array<{
  name: string;
  description: string;
  priceCents: number | null;
  priceSuffix: string;
  sortOrder: number;
}> = [
  {
    name: 'Trash Can Cleaning',
    description: 'Trash cans deep cleaned and set out to dry.',
    priceCents: 2000,
    priceSuffix: '',
    sortOrder: 1,
  },
  {
    name: 'Mowing',
    description: 'Mow, weedeat, and edge.',
    priceCents: 4000,
    priceSuffix: '',
    sortOrder: 2,
  },
  {
    name: 'Clean ups',
    description: 'Clean up all debris, leaves, and includes a mowing.',
    priceCents: 7500,
    priceSuffix: '+',
    sortOrder: 3,
  },
  {
    name: 'Raking',
    description: 'Rake and bag leaves.',
    priceCents: 7000,
    priceSuffix: '+',
    sortOrder: 4,
  },
  {
    name: 'Snow removal',
    description: 'Driveway + walkway clearing during winter storms.',
    priceCents: null,
    priceSuffix: '',
    sortOrder: 5,
  },
];

/**
 * seedFromBrief — overlays Sawyer's personal data into the DB.
 *
 * Only runs when `process.env.SEED_FROM_BRIEF === 'true'`.
 *
 * Guards:
 *   - site_config: only updates when `phone IS NULL` (not yet seeded)
 *   - services: only inserts when the table is empty
 *
 * Both guards make this call fully idempotent.
 *
 * Called by `src/server/boot.ts` after migrations.
 */
export function seedFromBrief(db: Db): void {
  if (process.env.SEED_FROM_BRIEF !== 'true') {
    return;
  }

  // --- site_config: personal fields ---
  const config = db.select({ phone: siteConfig.phone }).from(siteConfig).limit(1).all();

  if (config.length > 0 && config[0].phone === null) {
    db.update(siteConfig)
      .set({
        phone: '+19133097340',
        email: 'sshowalterservices@gmail.com',
        tiktokUrl: 'https://www.tiktok.com/@showalterservices',
        // Bio uses the `[age]` placeholder so the rendered age stays current
        // year-over-year — see `src/lib/age.ts` and `src/components/public/About.tsx`.
        // Admin can edit both DOB and bio from the Content → Contact tab.
        bio: 'My name is Sawyer Showalter, and I am a [age] year old entrepreneur. I take pride in providing affordable, high quality services you can trust every time.',
        // Seeded DOB is a placeholder — chosen so the brief-era "15 year old"
        // copy still reads correctly on fresh dev DBs at project inception.
        // Alex overrides this via Content → Contact once he has Sawyer's real
        // DOB. NOT considered authoritative data.
        dateOfBirth: '2010-10-15',
        ownerFirstName: 'Sawyer',
        emailTemplateSubject: 'Service inquiry — Sawyer Showalter Services',
        emailTemplateBody: "Hi Sawyer,\n\nI'd like to inquire about a service for my home.\n\nDetails:\n\n\nThanks!",
      })
      .where(isNull(siteConfig.phone))
      .run();
  }

  // --- services: insert if empty ---
  const existingCount = db.select({ id: services.id }).from(services).limit(1).all();

  if (existingCount.length === 0) {
    for (const svc of BRIEF_SERVICES) {
      db.insert(services)
        .values({
          name: svc.name,
          description: svc.description,
          priceCents: svc.priceCents,
          priceSuffix: svc.priceSuffix,
          sortOrder: svc.sortOrder,
          active: 1,
        })
        .run();
    }
  }

  // --- site_photos: insert gallery images if table is empty ---
  const existingPhotos = db
    .select({ id: sitePhotos.id })
    .from(sitePhotos)
    .limit(1)
    .all();

  if (existingPhotos.length === 0) {
    const seedPhotosDir = path.join(process.cwd(), 'seed-assets', 'site-photos');
    const manifestPath = path.join(seedPhotosDir, 'manifest.json');

    if (fs.existsSync(manifestPath)) {
      const manifest: Array<{
        file: string;
        caption: string;
        unsplash_url: string;
        photographer: string;
      }> = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Ensure uploads/ directory exists
      const uploadsDir = path.join(process.cwd(), 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });

      // Sort entries by filename for deterministic sort_order
      const sorted = [...manifest].sort((a, b) => a.file.localeCompare(b.file));

      const now = new Date().toISOString();

      sorted.forEach((entry, idx) => {
        const srcPath = path.join(seedPhotosDir, entry.file);
        const destPath = path.join(uploadsDir, entry.file);

        if (!fs.existsSync(srcPath)) {
          return; // skip missing source files
        }

        fs.copyFileSync(srcPath, destPath);

        db.insert(sitePhotos)
          .values({
            filePath: entry.file,
            caption: entry.caption,
            active: 1,
            sortOrder: idx + 1,
            createdAt: now,
          })
          .run();
      });
    }
  }
}
