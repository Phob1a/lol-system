import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Reachable with no session at all.
const PUBLIC_PREFIXES = ['/', '/login', '/access-denied', '/register', '/live', '/tournament', '/players'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/register') ||
    pathname.startsWith('/api/live') ||
    pathname.startsWith('/api/tournament/public') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  if (req.method === 'POST' && pathname === '/api/tournament/imports') return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req });
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (token.mustChangePwd && pathname !== '/change-password') {
    return NextResponse.redirect(new URL('/change-password', req.url));
  }

  if (pathname.startsWith('/admin') && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (pathname.startsWith('/captain') && (token.role !== 'CAPTAIN' || !token.teamId)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
