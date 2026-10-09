import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSession, findUser, SESSION_COOKIE } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listUsers } from '@/lib/leads';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { SetupNeeded } from '@/components/SetupNeeded';

export const dynamic = 'force-dynamic';

/** Demo mode is the only thing that lets anyone sign in without an inbox. */
const demoMode = () => process.env.NODE_ENV !== 'production' || env.DEMO_MAGIC_LINK;

/**
 * Magic link, our own: a one-time token row exchanged for a signed session
 * cookie. There is no email provider yet, so in demo mode the link is shown on
 * screen instead — and anyone with the URL can step into either role.
 */
async function requestLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUser(email);
  if (!user) {
    // Same response either way outside demo mode, so the form cannot be used
    // to discover who is on the team.
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
  const owner = team.find((u) => u.role === 'owner');
  const designers = team.filter((u) => u.role === 'designer');

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Aangan Leads</h1>
          <p className="text-sm text-ink-2 mt-1">
            Every phone enquiry to Aangan Studio answered, graded, and on a designer’s board — at 11pm on a Sunday as
            reliably as 11am on a Tuesday.
          </p>
        </div>

        {demo && (
          <section className="card p-5 shadow-card">
            <p className="label mb-1">Have a look around</p>
            <p className="text-sm text-ink-2 mb-4">
              Pick a seat. The board holds 14 example calls — nothing here is a real caller.
            </p>

            <div className="space-y-2">
              {owner && (
                <form action={signInAs}>
                  <input type="hidden" name="email" value={owner.email} />
                  <button className="btn btn-primary w-full justify-between" type="submit">
                    <span>Enter as {owner.name}</span>
                    <span className="text-xs opacity-70">owner · sees everything</span>
                  </button>
                </form>
              )}
              {designers.map((d) => (
                <form action={signInAs} key={d.email}>
                  <input type="hidden" name="email" value={d.email} />
                  <button className="btn w-full justify-between" type="submit">
                    <span>Enter as {d.name}</span>
                    <span className="text-xs text-ink-3">designer · board only</span>
                  </button>
                </form>
              ))}
            </div>

            <p className="text-xs text-ink-3 mt-4 leading-relaxed">
              A designer who opens the owner dashboard is sent back to the board — try it.
            </p>
          </section>
        )}

        <details className="mt-4 group">
          <summary className="text-xs text-ink-3 cursor-pointer select-none hover:text-ink-2">
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

        {demo && (
          <p className="text-[11px] text-ink-3 mt-5 leading-relaxed">
            Demo mode. Open sign-in is switched off — and real sign-in links start being emailed — the moment a real
            caller is in the system.
          </p>
        )}
      </div>
    </main>
  );
}
