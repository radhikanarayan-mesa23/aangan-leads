import { NextResponse, type NextRequest } from 'next/server';
import { one, sql } from '@/lib/db';
import { createSession, findUser, SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/login?error=Missing+token', req.url));

  const row = await one<{ email: string }>(
    'select email from magic_tokens where token = $1 and used_at is null and expires_at > now()',
    [token]
  );
  if (!row) return NextResponse.redirect(new URL('/login?error=That+link+has+expired', req.url));

  await sql('update magic_tokens set used_at = now() where token = $1', [token]);
  const user = await findUser(row.email);
  if (!user) return NextResponse.redirect(new URL('/login?error=No+longer+on+the+team', req.url));

  const jwt = await createSession({ email: user.email, name: user.name, role: user.role });
  const res = NextResponse.redirect(new URL(user.role === 'owner' ? '/owner' : '/board', req.url));
  res.cookies.set(SESSION_COOKIE, jwt, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
