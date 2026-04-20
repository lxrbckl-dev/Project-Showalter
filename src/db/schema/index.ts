/**
 * Schema barrel — re-exports every per-domain schema module so callers can
 * keep using `import * as schema from '@/db/schema'` (Drizzle client) or
 * cherry-pick specific tables (`import { siteConfig } from '@/db/schema'`).
 *
 * One file per domain, added as phases land:
 *   Phase 0: site-config.ts
 *   Phase 1: admins.ts, credentials.ts, recovery-codes.ts, auth-sessions.ts
 *   Phase 1C: admin-invites.ts (replaces env-driven admin onboarding, #83)
 *   Phase 2: services.ts
 *   Phase 3: site-photos.ts, uploads.ts
 *   Phase 4: availability.ts
 *   Phase 5: customers.ts, bookings.ts, booking-attachments.ts
 *   Phase 6: notifications.ts
 *   Phase 8: cron-runs.ts
 *   Phase 9: reviews.ts, review-photos.ts
 *
 * Conventions:
 *   - File names: kebab-case (matches the plural table name where reasonable)
 *   - Every file exports its `sqliteTable` instance AND the `$inferSelect` /
 *     `$inferInsert` row types
 *   - No cross-file FK wiring — FKs point at column refs, not table refs,
 *     so modules stay free of import cycles
 */
export * from './site-config';
export * from './admins';
export * from './credentials';
export * from './recovery-codes';
export * from './auth-sessions';
export * from './services';
export * from './availability';
export * from './site-photos';
export * from './customers';
export * from './customer-addresses';
export * from './bookings';
export * from './booking-attachments';
export * from './notifications';
export * from './cron-runs';
export * from './reviews';
export * from './review-photos';
