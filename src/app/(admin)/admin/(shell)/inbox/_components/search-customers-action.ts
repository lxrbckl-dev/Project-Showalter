'use server';

import { getDb } from '@/db';
import { auth } from '@/features/auth/auth';
import { searchCustomers } from '@/features/customers/queries';

/**
 * Local server action — Phase 9.
 *
 * Wraps `searchCustomers` for the StandaloneReviewWidget in the admin inbox.
 * Admin-guarded; returns at most 10 matches, trimmed to the fields the
 * widget actually renders. Kept colocated with its only caller.
 */

export type SearchMatch = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
};

export type SearchResult =
  | { ok: true; matches: SearchMatch[] }
  | { ok: false; error: string };

export async function searchCustomersAction(q: string): Promise<SearchResult> {
  const session = await auth();
  if (!session) return { ok: false, error: 'unauthenticated' };

  const trimmed = (q ?? '').trim();
  if (trimmed.length === 0) return { ok: true, matches: [] };

  const results = searchCustomers(getDb(), trimmed, 10);
  return {
    ok: true,
    matches: results.map((r) => ({
      id: r.customer.id,
      name: r.customer.name,
      phone: r.customer.phone,
      email: r.customer.email,
    })),
  };
}
