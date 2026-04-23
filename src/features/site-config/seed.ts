import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, isNull } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { siteConfig } from '@/db/schema/site-config';
import { services } from '@/db/schema/services';
import { sitePhotos } from '@/db/schema/site-photos';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { bookings } from '@/db/schema/bookings';
import { reviews } from '@/db/schema/reviews';
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
 * Realistic midwestern customer profiles for dev/demo.
 * Phones in E.164, Kansas City metro (+1913 / +1816) area codes.
 */
const BRIEF_CUSTOMERS: Array<{
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  address: string;
  /** ISO date offset from today (negative = past) — for created_at. */
  daysAgo: number;
}> = [
  {
    name: 'Linda Kowalczyk',
    phone: '+19134820183',
    email: 'linda.kowalczyk@gmail.com',
    notes: 'Prefers afternoon appointments. Has a golden retriever — latch the gate.',
    address: '412 Maple St, Overland Park, KS 66213',
    daysAgo: 120,
  },
  {
    name: 'Tom Bergfeld',
    phone: '+19134557821',
    notes: 'Paid cash last time. Keep the receipt.',
    address: '837 Sunflower Dr, Olathe, KS 66061',
    daysAgo: 90,
  },
  {
    name: 'Patricia Winslow',
    phone: '+18165043920',
    email: 'pwinslow@hotmail.com',
    address: '1105 Cedar Ave, Leawood, KS 66211',
    daysAgo: 75,
  },
  {
    name: 'Marcus Delacroix',
    phone: '+19133871046',
    email: 'mdelacroix@yahoo.com',
    notes: 'Allergic to weed killer — use organic products only.',
    address: '2208 Prairie Ridge Ln, Lenexa, KS 66215',
    daysAgo: 60,
  },
  {
    name: 'Sandra Hoffmann',
    phone: '+19138629375',
    notes: 'Has a sprinkler system — avoid driving over the heads.',
    address: '554 Elm Court, Shawnee, KS 66203',
    daysAgo: 45,
  },
  {
    name: 'James Petrocelli',
    phone: '+18162984471',
    email: 'jpetrocelli@outlook.com',
    address: '3317 Blue Valley Pkwy, Mission Hills, KS 66208',
    daysAgo: 30,
  },
  {
    name: 'Renee Tillman',
    phone: '+19134019632',
    address: '701 Oak Blvd, Prairie Village, KS 66208',
    daysAgo: 14,
  },
];

/**
 * Review text samples — realistic suburban lawn-care feedback.
 */
const BRIEF_REVIEWS: Array<{
  /** Index into BRIEF_CUSTOMERS. */
  customerIdx: number;
  /** Index into the inserted bookings array (for bookingId link), or null. */
  bookingIdx: number | null;
  status: 'submitted' | 'pending';
  rating?: number;
  reviewText?: string;
  /** Days ago the review was requested. */
  requestedDaysAgo: number;
  /** Days ago submitted (only for submitted status). */
  submittedDaysAgo?: number;
}> = [
  {
    customerIdx: 0,
    bookingIdx: 2, // completed booking
    status: 'submitted',
    rating: 5,
    reviewText:
      "Sawyer did an outstanding job on our yard — showed up right on time and left everything looking immaculate. The edging along the driveway was especially clean. We'll definitely be calling him back every week this summer.",
    requestedDaysAgo: 20,
    submittedDaysAgo: 19,
  },
  {
    customerIdx: 2,
    bookingIdx: null, // standalone — pre-app customer
    status: 'submitted',
    rating: 4,
    reviewText:
      "Great service overall. Sawyer was professional and thorough with the leaf cleanup. Only minor thing was he had to reschedule once, but he gave plenty of notice. Would recommend to anyone in the neighborhood.",
    requestedDaysAgo: 35,
    submittedDaysAgo: 34,
  },
  {
    customerIdx: 4,
    bookingIdx: null, // standalone
    status: 'submitted',
    rating: 3,
    reviewText:
      "Decent job on the mowing, but missed a strip along the fence line. When I pointed it out he came back the same afternoon and fixed it, which I appreciated. Communication was good, just needs to double-check around obstacles.",
    requestedDaysAgo: 50,
    submittedDaysAgo: 48,
  },
  {
    customerIdx: 1,
    bookingIdx: null, // pending review — no submission yet
    status: 'pending',
    requestedDaysAgo: 2,
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
        smsTemplate: "Hi Sawyer,\n\nI'd like to inquire about a service. Can you help?\n\nThanks!",
        statsJobsCompletedOverride: 150,
        statsCustomersServedOverride: 45,
        businessStartDate: '2023-04-15',
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

  // --- customers + customer_addresses: insert if empty ---
  const existingCustomers = db
    .select({ id: customers.id })
    .from(customers)
    .limit(1)
    .all();

  /** Map from BRIEF_CUSTOMERS index → inserted customer id. */
  const customerIdMap: number[] = [];
  /** Map from BRIEF_CUSTOMERS index → inserted customer_addresses id. */
  const addressIdMap: number[] = [];

  if (existingCustomers.length === 0) {
    for (const cust of BRIEF_CUSTOMERS) {
      const nowIso = new Date(
        Date.now() - cust.daysAgo * 24 * 60 * 60 * 1000,
      ).toISOString();

      const inserted = db
        .insert(customers)
        .values({
          name: cust.name,
          phone: cust.phone,
          email: cust.email ?? null,
          notes: cust.notes ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .returning()
        .all();

      const customerId = inserted[0].id;
      customerIdMap.push(customerId);

      const addrInserted = db
        .insert(customerAddresses)
        .values({
          customerId,
          address: cust.address,
          createdAt: nowIso,
          lastUsedAt: nowIso,
        })
        .returning()
        .all();

      addressIdMap.push(addrInserted[0].id);
    }
  }

  // --- bookings: insert if empty ---
  // Only seed bookings when we also seeded customers (maps are populated).
  const existingBookings = db
    .select({ id: bookings.id })
    .from(bookings)
    .limit(1)
    .all();

  /**
   * Inserted booking ids in order (index 0-4), used by the review seeder below
   * to link review to booking.
   */
  const insertedBookingIds: (number | null)[] = [];

  if (existingBookings.length === 0 && customerIdMap.length > 0) {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // We seed 5 bookings covering all major lifecycle states.
    // Service IDs: we look up the first 3 active services; fall back to id=1.
    const activeServices = db
      .select({ id: services.id })
      .from(services)
      .limit(5)
      .all();
    const svcIds = activeServices.map((s) => s.id);
    const svc = (n: number) => svcIds[n % svcIds.length] ?? 1;

    const bookingDefs: Array<{
      customerIdx: number;
      /** ISO timestamp for start_at. */
      startAt: string;
      status: 'pending' | 'accepted' | 'completed' | 'declined' | 'canceled';
      serviceIdx: number;
      notes?: string;
      decidedAt?: string;
    }> = [
      {
        customerIdx: 6, // Renee Tillman — newest customer
        startAt: new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString(), // today, 1 h from now
        status: 'pending',
        serviceIdx: 0, // Trash Can Cleaning
        notes: 'Both cans at curb, please.',
      },
      {
        customerIdx: 5, // James Petrocelli
        startAt: new Date(now.getTime() + 7 * dayMs).toISOString(), // next week
        status: 'accepted',
        serviceIdx: 1, // Mowing
        decidedAt: new Date(now.getTime() - 1 * dayMs).toISOString(),
      },
      {
        customerIdx: 0, // Linda Kowalczyk
        startAt: new Date(now.getTime() - 7 * dayMs).toISOString(), // last week
        status: 'completed',
        serviceIdx: 1, // Mowing
        decidedAt: new Date(now.getTime() - 7 * dayMs + 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        customerIdx: 3, // Marcus Delacroix
        startAt: new Date(now.getTime() - 14 * dayMs).toISOString(),
        status: 'declined',
        serviceIdx: 3, // Raking
        decidedAt: new Date(now.getTime() - 14 * dayMs + 30 * 60 * 1000).toISOString(),
        notes: 'Requested organic products, unavailable at this time.',
      },
      {
        customerIdx: 1, // Tom Bergfeld
        startAt: new Date(now.getTime() - 5 * dayMs).toISOString(),
        status: 'canceled',
        serviceIdx: 2, // Clean ups
        decidedAt: new Date(now.getTime() - 6 * dayMs).toISOString(),
        notes: 'Customer canceled — rescheduling next month.',
      },
    ];

    for (const def of bookingDefs) {
      const cIdx = def.customerIdx;
      const customerId = customerIdMap[cIdx];
      const addressId = addressIdMap[cIdx];
      const custData = BRIEF_CUSTOMERS[cIdx];

      if (customerId === undefined || addressId === undefined || !custData) {
        insertedBookingIds.push(null);
        continue;
      }

      const createdAt = new Date(
        new Date(def.startAt).getTime() - 3 * dayMs,
      ).toISOString();

      const inserted = db
        .insert(bookings)
        .values({
          token: crypto.randomUUID(),
          customerId,
          addressId,
          addressText: custData.address,
          customerName: custData.name,
          customerPhone: custData.phone,
          customerEmail: custData.email ?? null,
          serviceId: svc(def.serviceIdx),
          startAt: def.startAt,
          notes: def.notes ?? null,
          status: def.status,
          createdAt,
          updatedAt: createdAt,
          decidedAt: def.decidedAt ?? null,
        })
        .returning()
        .all();

      insertedBookingIds.push(inserted[0].id);

      // Bump lastBookingAt on the customer for completed/accepted bookings.
      if (def.status === 'completed' || def.status === 'accepted') {
        db.update(customers)
          .set({ lastBookingAt: def.startAt, updatedAt: createdAt })
          .where(eq(customers.id, customerId))
          .run();
      }
    }
  }

  // --- reviews: insert if empty ---
  const existingReviews = db
    .select({ id: reviews.id })
    .from(reviews)
    .limit(1)
    .all();

  if (existingReviews.length === 0 && customerIdMap.length > 0) {
    const dayMs = 24 * 60 * 60 * 1000;

    for (const rev of BRIEF_REVIEWS) {
      const customerId = customerIdMap[rev.customerIdx];
      if (customerId === undefined) continue;

      const bookingId =
        rev.bookingIdx !== null
          ? (insertedBookingIds[rev.bookingIdx] ?? null)
          : null;

      const requestedAt = new Date(
        Date.now() - rev.requestedDaysAgo * dayMs,
      ).toISOString();

      const submittedAt =
        rev.status === 'submitted' && rev.submittedDaysAgo !== undefined
          ? new Date(Date.now() - rev.submittedDaysAgo * dayMs).toISOString()
          : null;

      db.insert(reviews)
        .values({
          customerId,
          bookingId,
          token: crypto.randomUUID(),
          status: rev.status,
          rating: rev.rating ?? null,
          reviewText: rev.reviewText ?? null,
          requestedAt,
          submittedAt,
        })
        .run();
    }
  }
}
