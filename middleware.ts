import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Hard rule 5: designers cannot open the Owner Dashboard. Enforced here, again
// in the page (requireOwner), and in RLS when the database is Supabase.
const SESSION_COOKIE = 'aangan_session';
const secret = () =>
  new TextEncoder().encode((process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me-32chars').padEnd(32, '!'));

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      role = String(payload.role ?? '');
    } catch {
      role = null;
    }
  }

  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/owner') && role !== 'owner') {
    const url = req.nextUrl.clone();
    url.pathname = '/board';
    url.searchParams.set('denied', 'owner');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = { matcher: ['/board/:path*', '/owner/:path*'] };
