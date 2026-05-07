import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_PATHS = ['/login', '/access-denied'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next assets, API auth routes, public pages.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico' ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change before anything else.
  if (token.mustChangePwd && pathname !== '/change-password') {
    return NextResponse.redirect(new URL('/change-password', req.url));
  }

  // Once password is set, the change-password page is still allowed (voluntary change).

  // Role-based gates.
  if (pathname.startsWith('/admin') && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  if (pathname.startsWith('/captain')) {
    const eligible = token.role === 'CAPTAIN' && token.isCaptain && !token.isRetired;
    if (!eligible) {
      return NextResponse.redirect(new URL('/access-denied', req.url));
    }
  }

  // Root: route by role.
  if (pathname === '/') {
    if (token.role === 'ADMIN') return NextResponse.redirect(new URL('/admin', req.url));
    if (token.isCaptain && !token.isRetired) {
      return NextResponse.redirect(new URL('/captain', req.url));
    }
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
