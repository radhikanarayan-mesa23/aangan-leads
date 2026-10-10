'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn, initials } from '@/lib/utils';

type Tab = 'board' | 'calendar' | 'owner';

const ICONS: Record<Tab, React.ReactNode> = {
  board: (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]" aria-hidden>
      <rect x="2.5" y="3" width="4.5" height="14" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8.5" y="3" width="4.5" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14.5" y="3" width="3" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]" aria-hidden>
      <rect x="2.75" y="4.25" width="14.5" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.75 8.25h14.5M6.75 2.75v3M13.25 2.75v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  owner: (
    <svg viewBox="0 0 20 20" fill="none" className="size-[18px]" aria-hidden>
      <path d="M3 16.5V9M7.67 16.5V4.5M12.33 16.5v-5M17 16.5V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * The frame. A dark rail on the left rather than tabs across the top: it gives
 * the product somewhere to live, room for sections beyond three, and collapses
 * to icons on a narrow screen — which matters, because designers open this on a
 * phone between site visits.
 */
export function Shell({
  user,
  active,
  children,
}: {
  user: { name: string; email: string; role: string };
  active: Tab;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const tabs: { key: Tab; href: string; label: string; hint: string }[] = [
    { key: 'board', href: '/board', label: 'Board', hint: 'Every lead, by stage' },
    { key: 'calendar', href: '/board/calendar', label: 'Calendar', hint: 'Consultation slots' },
    ...(user.role === 'owner'
      ? [{ key: 'owner' as Tab, href: '/owner', label: 'Overview', hint: 'The business, end to end' }]
      : []),
  ];

  return (
    <div className="min-h-dvh flex">
      {/* rail */}
      <aside
        className={cn(
          'hero-rail fixed inset-y-0 left-0 z-40 flex flex-col transition-[width,transform] duration-300',
          'w-[232px] -translate-x-full lg:translate-x-0',
          open && 'translate-x-0'
        )}
      >
        <div className="px-5 pt-5 pb-6">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span
              className="grid place-items-center size-8 rounded-[10px] text-[13px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(140deg, var(--blue-500), var(--navy-700))' }}
              aria-hidden
            >
              A
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Aangan<span className="text-white/45"> Leads</span>
            </span>
          </Link>
        </div>

        <nav className="px-3 space-y-1 flex-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              onClick={() => setOpen(false)}
              aria-current={active === t.key ? 'page' : undefined}
              className={cn('rail-link', active === t.key && 'is-active')}
            >
              <span className="shrink-0">{ICONS[t.key]}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium leading-tight">{t.label}</span>
                <span className="block text-[11px] text-white/45 truncate">{t.hint}</span>
              </span>
            </Link>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <div className="rounded-card px-3 py-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <span
                className="grid place-items-center size-8 rounded-full text-[11px] font-semibold text-white shrink-0"
                style={{ background: 'linear-gradient(140deg, var(--blue-500), var(--navy-800))' }}
                aria-hidden
              >
                {initials(user.name)}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-white truncate">{user.name || user.email}</span>
                <span className="block text-[11px] text-white/45 capitalize">{user.role}</span>
              </span>
            </div>
            <form action="/api/auth/logout" method="post" className="mt-2.5">
              <button className="w-full text-left text-[11px] text-white/55 hover:text-white transition-colors">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-30 bg-black/35 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu" />}

      <div className="flex-1 min-w-0 lg:pl-[232px]">
        <header className="lg:hidden sticky top-0 z-20 bg-[var(--canvas-blur)] backdrop-blur-xl border-b border-line">
          <div className="h-14 px-4 flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="btn px-2.5" aria-label="Open menu">
              <svg viewBox="0 0 20 20" fill="none" className="size-[18px]" aria-hidden>
                <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <span className="font-semibold tracking-tight">
              Aangan<span className="text-ink-3"> Leads</span>
            </span>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-5 lg:py-7 max-w-[1500px]">{children}</main>
      </div>
    </div>
  );
}
