'use server';

/**
 * Admin management server actions for the `/admin/settings/admins` page.
 *
 * Complements `devices.ts` (credentials for a single admin) by exposing:
 *   - `listAdminsForUi()` — list every admin with device count + status
 *   - `disableAdmin(adminId)` — soft-disable, with last-enabled guard
 *   - `enableAdmin(adminId)` — re-enable
 *
 * Hard-delete is never exposed. Consistent with project-wide "no deletions"
 * policy.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { admins, credentials } from '@/db/schema';
import { auth } from './auth';
import { findAdminByEmail } from './admin-queries';
import { authFailure, logAuthFailure, type AuthResult, authOk } from './response';

export type AdminView = {
  id: number;
  email: string;
  active: boolean;
  enrolledAt: string | null;
  createdAt: string;
  deviceCount: number;
  isCurrentAdmin: boolean;
};

type AdminCtx = { adminId: number; email: string };

async function requireAdmin(): Promise<AdminCtx | null> {
  const session = await auth();
  if (!session) return null;
  const admin = findAdminByEmail(session.user.email);
  if (!admin || !admin.active || !admin.enrolledAt) return null;
  return { adminId: admin.id, email: admin.email };
}

export async function listAdminsForUi(): Promise<AdminView[]> {
  const ctx = await requireAdmin();
  if (!ctx) return [];

  const db = getDb();
  const rows = db.select().from(admins).all();
  const creds = db.select().from(credentials).all();

  const countByAdmin = new Map<number, number>();
  for (const c of creds) {
    countByAdmin.set(c.adminId, (countByAdmin.get(c.adminId) ?? 0) + 1);
  }

  return rows
    .map((r) => ({
      id: r.id,
      email: r.email,
      active: r.active === 1,
      enrolledAt: r.enrolledAt,
      createdAt: r.createdAt,
      deviceCount: countByAdmin.get(r.id) ?? 0,
      isCurrentAdmin: r.id === ctx.adminId,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Disable an admin. Guards:
 *   - Cannot disable yourself if you're the only enabled enrolled admin
 *     (equivalent to the last-device guard on devices.ts).
 *   - Cannot disable yourself at all, really — the UI hides the button;
 *     this re-enforces it at the API boundary.
 */
export async function disableAdmin(
  targetId: number,
): Promise<AuthResult<Record<string, never>>> {
  const ctx = await requireAdmin();
  if (!ctx) {
    logAuthFailure('not_authenticated', { scope: 'admin-mgmt:disable' });
    return authFailure();
  }

  if (typeof targetId !== 'number' || !Number.isInteger(targetId) || targetId <= 0) {
    return authFailure();
  }

  if (targetId === ctx.adminId) {
    return { ok: false, message: "You can't disable your own admin account." };
  }

  const db = getDb();
  const target = db.select().from(admins).where(eq(admins.id, targetId)).all()[0];
  if (!target) return authFailure();
  if (target.active === 0) return authOk();

  // Last-enabled-enrolled guard. If the target is the only enabled AND
  // enrolled admin, refuse — "can't lock the team out of the admin shell."
  const allAdmins = db.select().from(admins).all();
  const enabledEnrolled = allAdmins.filter((a) => a.active === 1 && a.enrolledAt !== null);
  if (
    enabledEnrolled.length <= 1 &&
    enabledEnrolled.some((a) => a.id === target.id)
  ) {
    return {
      ok: false,
      message: "Can't disable the only enabled admin — the team would be locked out.",
    };
  }

  db.update(admins).set({ active: 0 }).where(eq(admins.id, target.id)).run();
  return authOk();
}

export async function enableAdmin(
  targetId: number,
): Promise<AuthResult<Record<string, never>>> {
  const ctx = await requireAdmin();
  if (!ctx) {
    logAuthFailure('not_authenticated', { scope: 'admin-mgmt:enable' });
    return authFailure();
  }

  if (typeof targetId !== 'number' || !Number.isInteger(targetId) || targetId <= 0) {
    return authFailure();
  }

  const db = getDb();
  const target = db.select().from(admins).where(eq(admins.id, targetId)).all()[0];
  if (!target) return authFailure();

  db.update(admins).set({ active: 1 }).where(eq(admins.id, target.id)).run();
  return authOk();
}
