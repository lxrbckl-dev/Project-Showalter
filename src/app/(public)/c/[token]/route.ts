import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { bookings } from '@/db/schema/bookings';

/**
 * GET /c/<token> — Phase 7 shortlink.
 *
 * Serves as a compact `.ics` shortlink for SMS confirmations (carrier
 * length limits). Unknown tokens return 404 (vague, no enumeration).
 * Known tokens 302 to /bookings/<token>/ics.
 *
 * Per STACK.md § Conventions:
 *
 *   SMS shortlink for .ics — the confirmation SMS uses a short /c/<token>
 *   shortlink that 302s to /bookings/<token>/ics, so the SMS stays under
 *   typical carrier length limits.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  if (!token) {
    return new Response('Not found', { status: 404 });
  }

  const db = getDb();
  const row = db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.token, token))
    .limit(1)
    .all()[0];

  if (!row) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const target = new URL(`/bookings/${token}/ics`, url);
  return Response.redirect(target.toString(), 302);
}
