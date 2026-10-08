import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';
import { one } from './db';

// ASSUME: the database may be Neon rather than Supabase, so auth does not rely
// on Supabase Auth. It is a magic-link flow of our own: a one-time token row in
// `magic_tokens`, exchanged for a signed, httpOnly session cookie. Roles come
// from `users.role`. Supabase RLS policies are kept in migrations/002 for the
// day the project lands on Supabase.

export const SESSION_COOKIE = 'aangan_session';
export type Role = 'owner' | 'designer';
export type Session = { email: string; name: string; role: Role };

const key = () => new TextEncoder().encode(env.SESSION_SECRET.padEnd(32, '!'));

export async function createSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key());
}

export async function readSessionToken(token?: string | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.email || !payload.role) return null;
    return { email: String(payload.email), name: String(payload.name ?? ''), role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<Session | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Hard rule 5: role separation, enforced here and in middleware. */
export async function requireUser(): Promise<Session> {
  const u = await currentUser();
  if (!u) throw new Error('UNAUTHENTICATED');
  return u;
}

export async function requireOwner(): Promise<Session> {
  const u = await requireUser();
  if (u.role !== 'owner') throw new Error('FORBIDDEN');
  return u;
}

export async function findUser(email: string) {
  return one<{ email: string; name: string; role: Role; telegram_chat_id: string | null }>(
    'select email, name, role, telegram_chat_id from users where lower(email) = lower($1) and active',
    [email.trim()]
  );
}
