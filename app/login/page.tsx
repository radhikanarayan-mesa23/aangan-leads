import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSession, findUser, SESSION_COOKIE } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listUsers } from '@/lib/leads';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { SetupNeeded } from '@/components/SetupNeeded';
import { cn, initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Demo mode is the only thing that lets anyone sign in without an inbox. */
const demoMode = () => process.env.NODE_ENV !== 'production' || env.DEMO_MAGIC_LINK;

async function requestLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUser(email);
  if (!user) {
    if (!env.DEMO_MAGIC_LINK) redirect('/login?sent=1');
    redirect(`/login?error=${encodeURIComponent('That email is not on the team list.')}`);
  }
  const token = randomUUID().replace(/-/g, '');
  await sql("insert into magic_tokens (token, email, expires_at) values ($1,$2, now() + interval '20 minutes')", [token, user.email]);
  redirect(`/login?sent=1&link=${encodeURIComponent(`${env.APP_URL}/api/auth/login?token=${token}`)}`);
}

async function signInAs(formData: FormData) {
  'use server';
  if (!demoMode()) redirect('/login?error=Demo+sign-in+is+switched+off');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUser(email);
  if (!user) redirect(`/login?error=${encodeURIComponent('That email is not on the team list.')}`);
  const jwt = await createSession({ email: user.email, name: user.name, role: user.role });
  (await cookies()).set(SESSION_COOKIE, jwt, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  redirect(user.role === 'owner' ? '/owner' : '/board');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (!process.env.DATABASE_URL) return <SetupNeeded />;

  const demo = demoMode();
  let team: { email: string; name: string; role: string }[] = [];
  if (demo) {
    try {
      team = await listUsers();
    } catch {
      return <SetupNeeded detail="The database is set but the team table could not be read." />;
    }
  }
  // Owner first, then designers — the order the cards read in.
  const seats = [...team].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));

  return (
    <main className="min-h-dvh grid place-items-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-3xl">
        <section className="hero-vivid relative overflow-hidden px-6 py-8 sm:px-10 sm:py-11 shadow-pop animate-fade-up">
          {/* a soft light bloom, like a lamp in a finished room */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 right-[-12%] size-[28rem] rounded-full blur-3xl opacity-55"
            style={{ background: 'radial-gradient(circle, var(--blue-500) 0%, transparent 64%)' }}
          />

          <div className="relative">
            <div className="flex items-center gap-2">
              <span
                className="grid place-items-center size-7 rounded-[9px] text-[13px] font-bold"
                style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}
                aria-hidden
              >
                A
              </span>
              <span className="text-sm font-semibold tracking-tight text-white">
                Aangan<span className="opacity-60"> Leads</span>
              </span>
            </div>

            <span
              className="mt-8 inline-flex items-center gap-2 rounded-chip px-3 py-1.5 text-[12px] font-medium text-white"
              style={{ background: 'rgba(142,163,247,0.18)', backdropFilter: 'blur(6px)' }}
            >
              Open late, like good ideas 🌙
            </span>

            <h1 className="mt-4 text-[34px] sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.08] text-white">
              {['Welcome', 'to', 'Aangan'].map((w, i) => (
                <span key={w} className="word" style={{ animationDelay: `${120 + i * 110}ms` }}>
                  {w}
                  {i < 2 ? '\u00A0' : ''}
                </span>
              ))}
            </h1>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed" style={{ color: 'rgba(222,231,255,0.78)' }}>
              Every beautiful room starts with a conversation — so we make sure not one of them rings out.
              Pick a seat and see where today&rsquo;s calls landed.
            </p>

            {/* the three seats */}
            {demo && (
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {seats.map((u, i) => {
                  const owner = u.role === 'owner';
                  return (
                    <form action={signInAs} key={u.email} className="contents">
                      <input type="hidden" name="email" value={u.email} />
                      <button
                        type="submit"
                        style={{ animationDelay: `${120 + i * 70}ms` }}
                        className="seat lead-card group relative text-left rounded-card p-4 min-h-[146px] flex flex-col"
                      >
                        <span className="seat-avatar grid place-items-center size-7 rounded-full text-[11px] font-semibold" aria-hidden>
                          {initials(u.name)}
                        </span>

                        <span className="mt-auto block text-[15px] font-semibold leading-tight">{u.name}</span>
                        <span className="seat-sub mt-1 block text-[12px]">
                          {owner ? 'Owner · sees the whole business' : 'Designer · works the board'}
                        </span>
                        <span className="seat-cta mt-2 inline-flex items-center gap-1 text-[12px] font-medium">
                          Enter →
                        </span>
                      </button>
                    </form>
                  );
                })}
              </div>
            )}

            {demo && (
              <p className="mt-5 text-[12px]" style={{ color: 'rgba(222,231,255,0.55)' }}>
                Fourteen example calls, no real callers. A designer who opens the owner dashboard gets sent back to the board — do try it.
              </p>
            )}
          </div>
        </section>

        {/* the real way in, once sign-in links are emailed */}
        <details className="mt-4 group">
          <summary className="text-xs text-ink-3 cursor-pointer select-none hover:text-ink-2 px-1">
            Sign in with a work email instead
          </summary>
          <form action={requestLink} className="card p-5 space-y-3 shadow-card mt-2">
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required placeholder="nikhil@aanganstudio.in" className="input" autoComplete="email" />
            <button type="submit" className="btn w-full">Send me a link</button>
            {sp.error && <p className="text-sm text-[var(--hot)]">{sp.error}</p>}
            {sp.sent &&
              (demo ? (
                <div className="text-sm text-ink-2 space-y-2">
                  <p>Link created. No email provider is wired up yet, so it is shown here.</p>
                  <a className="underline break-all text-ink" href={sp.link}>{sp.link}</a>
                </div>
              ) : (
                <p className="text-sm text-ink-2">
                  If that address is on the team, a sign-in link is on its way. It expires in 20 minutes.
                </p>
              ))}
          </form>
        </details>
      </div>
    </main>
  );
}
