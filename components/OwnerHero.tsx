'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { inr } from '@/lib/pricing';

/**
 * The dark band the dashboard opens with: one plain-English sentence about the
 * state of the board, the three numbers Nikhil actually asks about, and where
 * this month's leads came from.
 */
export function OwnerHero({
  headline,
  sub,
  stats,
  localities,
}: {
  headline: string;
  sub: string;
  stats: { label: string; value: string }[];
  localities: { name: string; total: number; HOT: number }[];
}) {
  const max = Math.max(...localities.map((l) => l.total), 1);

  return (
    <section className="hero px-6 py-6 sm:px-8 sm:py-7">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: 'var(--blue-300)' }}>
            All leads · last 30 days
          </p>

          <h1 className="mt-3 text-[26px] sm:text-[30px] font-semibold tracking-[-0.02em] leading-[1.15]">{headline}</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(222,231,255,0.72)' }}>{sub}</p>

          <div className="mt-7 flex flex-wrap gap-x-10 gap-y-5">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[32px] sm:text-[38px] font-semibold tabular-nums tracking-[-0.03em] leading-none">{s.value}</p>
                <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(222,231,255,0.6)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-3" style={{ color: 'var(--blue-300)' }}>
            Where they came from
          </p>
          {localities.length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(222,231,255,0.6)' }}>No leads yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={localities} margin={{ top: 22, right: 0, left: 0, bottom: 0 }} barCategoryGap="26%">
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgba(222,231,255,0.66)', fontSize: 11 }}
                  interval={0}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(142,163,247,0.08)' }}
                  contentStyle={{
                    background: 'var(--navy-800)',
                    border: '1px solid rgba(142,163,247,0.25)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#fff',
                  }}
                  labelStyle={{ color: 'var(--blue-300)' }}
                  formatter={(v: any, n: any) => [v, n === 'HOT' ? 'Hot' : 'All leads']}
                />
                <Bar dataKey="total" radius={[5, 5, 0, 0]} label={{ position: 'top', fill: '#fff', fontSize: 12 }}>
                  {localities.map((l, i) => (
                    <Cell
                      key={i}
                      // Brightest where the hot leads actually are.
                      fill={`color-mix(in srgb, var(--blue-500) ${28 + (l.HOT / Math.max(l.total, 1)) * 62}%, var(--navy-700))`}
                      opacity={0.45 + (l.total / max) * 0.55}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-1 text-[11px]" style={{ color: 'rgba(222,231,255,0.5)' }}>
            Brighter bars carry more hot leads.
          </p>
        </div>
      </div>
    </section>
  );
}
