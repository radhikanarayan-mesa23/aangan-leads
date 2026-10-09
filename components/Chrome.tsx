import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Chrome({
  user,
  active,
  children,
  right,
}: {
  user: { name: string; email: string; role: string };
  active: 'board' | 'calendar' | 'owner';
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const tabs = [
    { key: 'board', href: '/board', label: 'Board' },
    { key: 'calendar', href: '/board/calendar', label: 'Calendar' },
    ...(user.role === 'owner' ? [{ key: 'owner', href: '/owner', label: 'Overview' }] : []),
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 bg-[var(--canvas-blur)] backdrop-blur-xl border-b border-line">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0 group">
            <span
              className="grid place-items-center size-7 rounded-[9px] text-white text-[12px] font-bold tracking-tight"
              style={{ background: 'linear-gradient(140deg, var(--blue-500), var(--navy-800))' }}
              aria-hidden
            >
              A
            </span>
            <span className="font-semibold tracking-tight">Aangan<span className="text-ink-3"> Leads</span></span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  'px-2.5 py-1.5 rounded-card text-sm whitespace-nowrap transition-colors',
                  active === t.key ? 'bg-navy text-white font-medium shadow-card' : 'text-ink-2 hover:bg-surface-2'
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {right}
            <form action="/api/auth/logout" method="post">
              <button className="text-xs text-ink-3 hover:text-ink" title={user.email}>
                {user.name || user.email} · sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-5">{children}</main>
    </div>
  );
}
