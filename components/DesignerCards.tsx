'use client';

import { inr } from '@/lib/pricing';
import { cn, initials } from '@/lib/utils';
import type { DesignerRow } from '@/lib/analytics';

/** A win-rate ring. Reads in a glance where a percentage in a table does not. */
function Ring({ value }: { value: number | null }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <div className="relative size-[58px] shrink-0">
      <svg viewBox="0 0 56 56" className="size-full -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        {value != null && (
          <circle
            cx="28" cy="28" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          />
        )}
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--navy-700)" />
            <stop offset="100%" stopColor="var(--blue-500)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular-nums">
        {value == null ? <span className="text-ink-3">—</span> : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

/**
 * A card per designer. Two seconds tells Nikhil who is carrying what, who is
 * closing, and whose leads are being let down — which a table of figures makes
 * him work for.
 */
export function DesignerCards({ team }: { team: DesignerRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {team.map((t, i) => {
        const unclaimed = !t.email;
        return (
          <article
            key={t.email ?? t.name}
            className={cn('card p-4 animate-fade-up', unclaimed && 'border-dashed')}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'grid place-items-center size-10 rounded-full text-[13px] font-semibold shrink-0',
                  unclaimed ? 'text-ink-3 border border-dashed border-line-strong' : 'text-white'
                )}
                style={unclaimed ? undefined : { background: 'linear-gradient(140deg, var(--blue-500), var(--navy-800))' }}
                aria-hidden
              >
                {unclaimed ? '—' : initials(t.name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className={cn('font-medium leading-tight truncate', unclaimed && 'text-ink-2 italic')}>{t.name}</p>
                <p className="text-[11px] text-ink-3">
                  {unclaimed ? 'nobody has claimed these' : `${t.open} open · ${t.consultations} consultation${t.consultations === 1 ? '' : 's'}`}
                </p>
              </div>

              <div className="text-center shrink-0">
                <Ring value={t.winRate} />
                <p className="text-[10px] text-ink-3 mt-0.5">
                  {t.closed ? `of ${t.closed} closed` : 'none closed'}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="label">Won</dt>
                <dd className="text-[15px] font-semibold tabular-nums mt-0.5">{t.converted}</dd>
              </div>
              <div>
                <dt className="label">Revenue</dt>
                <dd className="text-[15px] font-semibold tabular-nums mt-0.5" style={{ color: t.revenue ? 'var(--ok)' : undefined }}>
                  {t.revenue ? inr(t.revenue) : '—'}
                </dd>
              </div>
              <div>
                <dt className="label">Lost</dt>
                <dd className="text-[15px] font-semibold tabular-nums mt-0.5">{t.notConverted || '—'}</dd>
              </div>
            </dl>

            <div className="mt-3 pt-3 border-t border-line">
              {t.needsAttention === 0 ? (
                <p className="chip fit-fits">✓ Nothing waiting</p>
              ) : (
                <p className="chip fit-below">⚠︎ {t.attentionReasons.join(' · ')}</p>
              )}
              {t.topLostReason && (
                <p className="mt-2 text-[11px] text-ink-3 line-clamp-2" title={t.topLostReason}>
                  Most often lost: {t.topLostReason}
                </p>
              )}
              {t.medianFirstContactMin != null && (
                <p className="mt-1.5 text-[11px] text-ink-3">
                  Typically answers in {t.medianFirstContactMin < 60 ? `${t.medianFirstContactMin}m` : `${Math.round(t.medianFirstContactMin / 60)}h`}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
