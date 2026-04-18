'use server';

import { getDb } from '@/db';
import { siteConfig, type SiteConfigRow } from '@/db/schema/site-config';

/**
 * Returns the single site_config row, or null if the table is somehow empty.
 * This is the read-side helper used by both the admin CMS and the public landing.
 */
export async function getSiteConfig(): Promise<SiteConfigRow | null> {
  const db = getDb();
  const rows = db.select().from(siteConfig).limit(1).all();
  return rows[0] ?? null;
}
