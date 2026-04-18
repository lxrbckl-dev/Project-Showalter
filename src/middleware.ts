import { NextResponse, type NextRequest } from 'next/server';

/**
 * Admin-route gate.
 *
 * Any /admin/* path without our session cookie is redirected to
 * /admin/login. The cookie itself is validated on the server side by
 * `auth()` from `@/features/auth/auth`; the middleware only checks
 * presence. This is fine because the cookie is HttpOnly + set by us —
 * an attacker with a bogus cookie value just fails the real check.
 *
 * We skip:
 *   - `/admin/login` itself (otherwise we'd loop)
 *   - Next.js internals (`_next`, favicon, etc.)
 */

const SESSION_COOKIE = 'swt-session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/admin/_next')) return NextResponse.next();

  const hasSession = req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
