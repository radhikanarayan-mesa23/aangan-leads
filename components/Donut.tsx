'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { inr } from '@/lib/pricing';

/** The brand ramp, darkest first — biggest slice gets the most weight. */
const RAMP = ['var(--navy-800)', 'var(--blue-600)', 'var(--blue-500)', 'var(--blue-400)', 'var(--blue-300)', 'var(--blue-100)'];

export type DonutSlice = { key: string; label: string; value: number; sub?: string };

/**
 * A donut with the headline sitting in the hole, because the number people
 * want is the total — the slices are the supporting detail.
 */
export function Donut({
  slices,
  centreValue,
  centreLabel,
  money = false,
  height = 200,
}: {
  slices: DonutSlice[];
  centreValue: string;
  centreLabel: string;
  money?: boolean;
  height?: number;
}) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((a, s) => a + s.value, 0);

  if (data.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-ink-3" style={{ height }}>
        Nothing to show yet.
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((s, i) => (
              <Cell key={s.key} fill={RAMP[i % RAMP.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: '0 12px 32px rgba(10,18,50,0.14)',
            }}
            formatter={(v: any, label: any) => [
              money ? inr(Number(v)) : v,
              `${label}${total ? ` · ${Math.round((Number(v) / total) * 100)}%` : ''}`,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div className="text-center">
          <p className="text-[19px] font-semibold tabular-nums tracking-tight leading-none">{centreValue}</p>
          <p className="text-[10px] uppercase tracking-[0.09em] text-ink-3 mt-1">{centreLabel}</p>
        </div>
      </div>
    </div>
  );
}

/** The legend, as a list that also carries the number — a colour key alone is useless. */
export function DonutLegend({ slices, money = false }: { slices: DonutSlice[]; money?: boolean }) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((a, s) => a + s.value, 0);
  return (
    <ul className="space-y-1.5 text-sm">
      {data.map((s, i) => (
        <li key={s.key} className="flex items-baseline gap-2">
          <span className="size-2.5 rounded-sm shrink-0 translate-y-[1px]" style={{ background: RAMP[i % RAMP.length] }} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{s.label}</span>
          <span className="tabular-nums font-medium">{money ? inr(s.value) : s.value}</span>
          <span className="tabular-nums text-ink-3 text-[11px] w-9 text-right">
            {total ? `${Math.round((s.value / total) * 100)}%` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
