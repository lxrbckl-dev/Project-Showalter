import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type * as schema from '@/db/schema';
import {
  ACTIVE_HOLD_STATUSES,
  bookings,
  type BookingRow,
} from '@/db/schema/bookings';
import { customers } from '@/db/schema/customers';
import { customerAddresses } from '@/db/schema/customer-addresses';
import { services } from '@/db/schema/services';
import { siteConfig as siteConfigTable } from '@/db/schema/site-config';
import {
  bumpLastBookingAt,
  matchOrCreateCustomer,
  normalizeAddress,
} from '@/features/customers/match';
import { normalizeUSPhone } from '@/lib/formatters/phone';

/**
 * Admin-initiated booking ("walk-in") core — Phase 6.
 *
 * Parallel to the public `submitBookingCore` but with different semantics per
 * STACK.md § Admin-initiated bookings:
 *
 *   - Status starts at `accepted` (not pending). Sawyer is the authority —
 *     there's nobody to accept his own booking.
 *   - The normal spacing + advance-notice guardrails are surfaced as
 *     WARNINGS in the UI but do NOT block submission. When the caller passes
 *     `force=true`, we skip the checks entirely and fall straight through to
 *     the insert. When `force=false`, we compute the warnings, return them
 *     alongside `ok: false, kind: 'warnings'`, and let the caller retry with
 *     `force=true` if Sawyer chooses to proceed.
 *   - Supports both "pick existing customer" (`customerId` present) and
 *     "create new customer" (raw name/phone/email/address in the payload).
 *   - No honeypot, no rate limit — this endpoint requires an admin session.
 */

type Db = BetterSQLite3Database<typeof schema>;

export const adminCreateInputSchema = z
  .object({
    serviceId: z.coerce.number().int().positive(),
    startAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, {
        message: 'Invalid start time.',
      }),
    notes: z
      .string()
      .max(2000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    /** True to bypass soft warnings (spacing + advance-notice). */
    force: z.coerce.boolean().optional().default(false),
    /** If present: reuse the existing customer by id. */
    customerId: z.coerce.number().int().positive().optional(),
    /** Optional existing-address id when customerId is set. */
    addressId: z.coerce.number().int().positive().optional(),
    /** Mandatory when `customerId` is absent OR when we're creating a new address. */
    name: z.string().max(100).optional(),
    phone: z.string().optional(),
    email: z
      .string()
      .max(254)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    address: z.string().max(500).optional(),
  })
  .refine(
    (d) =>
      d.customerId !== undefined ||
      (typeof d.name === 'string' && d.name.trim().length > 0),
    { message: 'Name is required when creating a new customer.', path: ['name'] },
  )
  .refine(
    (d) =>
      d.customerId !== undefined ||
      (typeof d.phone === 'string' && d.phone.trim().length > 0),
    {
      message: 'Phone is required when creating a new customer.',
      path: ['phone'],
    },
  )
  .refine(
    (d) =>
      d.customerId !== undefined ||
      (typeof d.address === 'string' && d.address.trim().length > 0),
    {
      message: 'Address is required when creating a new customer.',
      path: ['address'],
    },
  );

export type AdminCreateInput = z.input<typeof adminCreateInputSchema>;
export type AdminCreateData = z.output<typeof adminCreateInputSchema>;

export type AdminWarning =
  | { kind: 'too_soon'; minAdvanceNoticeHours: number }
  | { kind: 'too_close_to_another'; heldStartAt: string; spacingMinutes: number };

export type AdminCreateResult =
  | { ok: true; booking: BookingRow }
  | { ok: false; kind: 'validation'; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: 'warnings'; warnings: AdminWarning[] }
  | { ok: false; kind: 'service_inactive' }
  | { ok: false; kind: 'slot_taken' }
  | { ok: false; kind: 'customer_not_found' }
  | { ok: false; kind: 'internal'; message: string };

export interface AdminCreateCoreInput {
  /** Raw input — either a parsed object or a FormData. Accepts both for DX. */
  input: AdminCreateInput | FormData;
  db: Db;
  now?: Date;
  /** Token generator — overridable in tests for determinism. */
  generateToken?: () => string;
}

function formDataToInput(fd: FormData): AdminCreateInput {
  const get = (k: string): string | undefined => {
    const v = fd.get(k);
    return v == null ? undefined : String(v);
  };
  return {
    serviceId: get('serviceId') ?? '',
    startAt: get('startAt') ?? '',
    notes: get('notes'),
    force: get('force') === 'true' || get('force') === '1',
    customerId: get('customerId') ?? undefined,
    addressId: get('addressId') ?? undefined,
    name: get('name'),
    phone: get('phone'),
    email: get('email'),
    address: get('address'),
  } as AdminCreateInput;
}

function computeWarnings(
  startAtIso: string,
  db: Db,
  now: Date,
): AdminWarning[] {
  const cfg = db
    .select({
      minAdvanceNoticeHours: siteConfigTable.minAdvanceNoticeHours,
      bookingSpacingMinutes: siteConfigTable.bookingSpacingMinutes,
    })
    .from(siteConfigTable)
    .limit(1)
    .all()[0];
  if (!cfg) return [];

  const warnings: AdminWarning[] = [];
  const startMs = new Date(startAtIso).getTime();
  const earliest = now.getTime() + cfg.minAdvanceNoticeHours * 3_600_000;
  if (startMs < earliest) {
    warnings.push({
      kind: 'too_soon',
      minAdvanceNoticeHours: cfg.minAdvanceNoticeHours,
    });
  }

  const spacingMs = cfg.bookingSpacingMinutes * 60_000;
  const winStart = new Date(startMs - spacingMs).toISOString();
  const winEnd = new Date(startMs + spacingMs).toISOString();
  const held = db
    .select({ startAt: bookings.startAt })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, [...ACTIVE_HOLD_STATUSES]),
        gte(bookings.startAt, winStart),
        lte(bookings.startAt, winEnd),
      ),
    )
    .all();
  for (const row of held) {
    if (row.startAt === startAtIso) continue; // exact match handled by slot_taken path
    warnings.push({
      kind: 'too_close_to_another',
      heldStartAt: row.startAt,
      spacingMinutes: cfg.bookingSpacingMinutes,
    });
  }

  return warnings;
}

export function adminCreateBookingCore(
  opts: AdminCreateCoreInput,
): AdminCreateResult {
  const { db, now = new Date(), generateToken = randomUUID } = opts;
  const raw =
    opts.input instanceof FormData
      ? formDataToInput(opts.input)
      : opts.input;

  const parsed = adminCreateInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, kind: 'validation', fieldErrors };
  }
  const data = parsed.data;

  // Service must exist and be active.
  const svc = db
    .select()
    .from(services)
    .where(eq(services.id, data.serviceId))
    .limit(1)
    .all()[0];
  if (!svc || svc.active !== 1) {
    return { ok: false, kind: 'service_inactive' };
  }

  // Soft warnings (bypassable with force=true).
  if (!data.force) {
    const warnings = computeWarnings(data.startAt, db, now);
    if (warnings.length > 0) {
      return { ok: false, kind: 'warnings', warnings };
    }
  }

  // Resolve customer + address.
  // Two paths:
  //   A) `customerId` given — fetch the customer row, require `address` (if
  //      addressId absent we create a new address row on that customer).
  //   B) `customerId` absent — full match-or-create using the Phase 5 path.
  let customerId: number;
  let addressId: number;
  let addressText: string;
  let customerName: string;
  let customerPhoneE164: string;
  let customerEmail: string | null;

  if (data.customerId !== undefined) {
    const cust = db
      .select()
      .from(customers)
      .where(eq(customers.id, data.customerId))
      .limit(1)
      .all()[0];
    if (!cust) {
      return { ok: false, kind: 'customer_not_found' };
    }
    customerId = cust.id;
    customerName = cust.name;
    customerPhoneE164 = cust.phone;
    customerEmail = cust.email ?? null;

    if (data.addressId !== undefined) {
      const addr = db
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, data.addressId),
            eq(customerAddresses.customerId, cust.id),
          ),
        )
        .limit(1)
        .all()[0];
      if (!addr) {
        return {
          ok: false,
          kind: 'validation',
          fieldErrors: { addressId: ['Unknown address for this customer.'] },
        };
      }
      addressId = addr.id;
      addressText = addr.address;
      db.update(customerAddresses)
        .set({ lastUsedAt: now.toISOString() })
        .where(eq(customerAddresses.id, addr.id))
        .run();
    } else {
      if (!data.address || data.address.trim().length === 0) {
        return {
          ok: false,
          kind: 'validation',
          fieldErrors: { address: ['Please enter the service address.'] },
        };
      }
      // Reuse an existing address if the normalized form matches one on file;
      // otherwise insert a new row. This mirrors `matchOrCreateCustomer`'s
      // address handling so the INDEX book stays clean.
      const existing = db
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, cust.id))
        .all();
      const addrNorm = normalizeAddress(data.address);
      const match = existing.find(
        (row) => normalizeAddress(row.address) === addrNorm,
      );
      if (match) {
        addressId = match.id;
        addressText = data.address;
        db.update(customerAddresses)
          .set({ lastUsedAt: now.toISOString() })
          .where(eq(customerAddresses.id, match.id))
          .run();
      } else {
        const inserted = db
          .insert(customerAddresses)
          .values({
            customerId: cust.id,
            address: data.address,
            createdAt: now.toISOString(),
            lastUsedAt: now.toISOString(),
          })
          .returning()
          .all();
        addressId = inserted[0].id;
        addressText = data.address;
      }
    }
  } else {
    // No customerId — full match-or-create path. Required fields were
    // enforced by the refine()s above.
    const phoneNormalized = normalizeUSPhone(data.phone ?? '');
    if (!phoneNormalized) {
      return {
        ok: false,
        kind: 'validation',
        fieldErrors: { phone: ['Please enter a valid US phone number.'] },
      };
    }
    const match = matchOrCreateCustomer(
      {
        name: data.name!.trim(),
        phone: phoneNormalized,
        email: data.email ?? null,
        address: data.address!.trim(),
      },
      db,
      () => now.toISOString(),
    );
    customerId = match.customerId;
    addressId = match.addressId;
    addressText = data.address!.trim();
    customerName = data.name!.trim();
    customerPhoneE164 = phoneNormalized;
    customerEmail = data.email ?? null;
  }

  // Insert the booking. Status starts at 'accepted'.
  const token = generateToken();
  const nowIso = now.toISOString();
  try {
    const inserted = db
      .insert(bookings)
      .values({
        token,
        customerId,
        addressId,
        addressText,
        customerName,
        customerPhone: customerPhoneE164,
        customerEmail,
        serviceId: data.serviceId,
        startAt: data.startAt,
        notes: data.notes,
        status: 'accepted',
        createdAt: nowIso,
        updatedAt: nowIso,
        decidedAt: nowIso,
      })
      .returning()
      .all();
    bumpLastBookingAt(customerId, data.startAt, db);
    return { ok: true, booking: inserted[0] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE constraint failed/i.test(msg)) {
      return { ok: false, kind: 'slot_taken' };
    }
    return { ok: false, kind: 'internal', message: msg };
  }
}
