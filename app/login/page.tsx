import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSession, findUser, SESSION_COOKIE } from '@/lib/auth';
import { sql } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Magic link, our own: a one-time token row exchanged for a signed session
 * cookie. In development the link is printed on the page rather than emailed,
 * so the demo never waits on an inbox.
 */
async function requestLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUser(email);
  if (!user) redirect(`/login?error=${encodeURIComponent('That email is not on the team list.')}`);

  const token = randomUUID().replace(/-/g, '');
  await sql("insert into magic_tokens (token, email, expires_at) values ($1,$2, now() + interval '20 minutes')", [token, user.email]);
  redirect(`/login?sent=1&link=${encodeURIComponent(`${env.APP_URL}/api/auth/login?token=${token}`)}`);
}

async function signInDirect(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUser(email);
  if (!user) redirect(`/login?error=${encodeURIComponent('That email is not on the team list.')}`);
  const jwt = await createSession({ email: user.email, name: user.name, role: user.role });
  (await cookies()).set(SESSION_COOKIE, jwt, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  redirect(user.role === 'owner' ? '/owner' : '/board');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const devMode = process.env.NODE_ENV !== 'production';

  return (
    <main className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight">Aangan Leads</h1>
          <p className="text-sm text-ink-2 mt-1">Every enquiry answered, graded, and on a designer’s board.</p>
        </div>

        <form action={devMode ? signInDirect : requestLink} className="card p-5 space-y-3 shadow-card">
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" required placeholder="nikhil@aanganstudio.in" className="input" autoComplete="email" />
          <button type="submit" className="btn btn-primary w-full">
            {devMode ? 'Sign in' : 'Send me a link'}
          </button>
          {sp.error && <p className="text-sm text-[var(--hot)]">{sp.error}</p>}
          {sp.sent && (
            <div className="text-sm text-ink-2 space-y-2">
              <p>Link created. In development it is shown here instead of emailed:</p>
              <a className="underline break-all text-ink" href={sp.link}>{sp.link}</a>
            </div>
          )}
        </form>

        <p className="text-xs text-ink-3 mt-4 leading-relaxed">
          Designers see the board. Only Nikhil sees the owner dashboard.
        </p>
      </div>
    </main>
  );
}
