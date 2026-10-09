'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { inr } from '@/lib/pricing';

const GRADE_FILL: Record<string, string> = {
  HOT: 'var(--hot)',
  WARM: 'var(--warm)',
  LOW: 'var(--low)',
  ESCALATE: 'var(--escalate)',
};

const axis = { stroke: 'var(--ink-3)', fontSize: 11, tickLine: false, axisLine: false } as const;
const BLUE = 'var(--blue-500)';
const NAVY = 'var(--navy-700)';
const grid = <CartesianGrid stroke="var(--line)" vertical={false} />;
const tip = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--line-strong)',
    borderRadius: 12,
    fontSize: 12,
    boxShadow: '0 12px 32px rgba(10,18,50,0.12)',
  },
} as const;

export function LeadsOverTime({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        {(['HOT', 'WARM', 'LOW'] as const).map((g) => (
          <Area key={g} type="monotone" dataKey={g} stackId="1" stroke={GRADE_FILL[g]} fill={GRADE_FILL[g]} fillOpacity={0.22} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LocalityChart({ data }: { data: { name: string; total: number; HOT: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={96} />
        <Tooltip {...tip} />
        <Bar dataKey="total" name="All leads" fill="var(--blue-100)" radius={[0, 5, 5, 0]} barSize={14} />
        <Bar dataKey="HOT" name="Hot" fill="var(--hot)" radius={[0, 5, 5, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SourceChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={88} />
        <Tooltip {...tip} />
        <Bar dataKey="value" name="Leads" radius={[0, 5, 5, 0]} barSize={14} fill={BLUE} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FunnelChart({ data }: { data: { stage: string; count: number; dropoff: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ol className="space-y-2">
      {data.map((d) => (
        <li key={d.stage}>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span>{d.stage}</span>
            <span className="text-ink-3 tabular-nums">
              {d.count}
              {d.dropoff > 0 && <span className="ml-2 text-[var(--hot)]">−{d.dropoff}%</span>}
            </span>
          </div>
          <div className="h-2 rounded-chip bg-surface-2 overflow-hidden">
            <div className="h-full rounded-chip transition-all" style={{ width: `${(d.count / max) * 100}%`, background: `linear-gradient(90deg, ${NAVY}, ${BLUE})` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CostVsRevenue({ data }: { data: { month: string; cost: number; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} tickFormatter={(v) => inr(v)} />
        <Tooltip {...tip} formatter={(v: any) => inr(Number(v))} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="revenue" name="Revenue won" fill="var(--ok)" radius={[5, 5, 0, 0]} barSize={26} />
        <Line dataKey="cost" name="AI cost" stroke={NAVY} strokeWidth={2.5} dot={{ r: 3, fill: NAVY }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Calls by hour × weekday. Office hours (10am–7pm) are outlined. */
export function Heatmap({ data }: { data: { day: number; hour: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="border-separate border-spacing-[2px] text-[10px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="font-normal text-ink-3 w-5">{h % 3 === 0 ? h : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <tr key={d}>
              <td className="text-ink-3 pr-1.5 text-right">{DAY[d]}</td>
              {hours.map((h) => {
                const c = data.find((x) => x.day === d && x.hour === h)?.count ?? 0;
                const office = h >= 10 && h < 19;
                return (
                  <td
                    key={h}
                    title={`${DAY[d]} ${h}:00 — ${c} call${c === 1 ? '' : 's'}`}
                    className="size-5 rounded-[3px]"
                    style={{
                      background: c ? `color-mix(in srgb, var(--blue-500) ${18 + (c / max) * 76}%, var(--ice))` : 'var(--surface-2)',
                      outline: office ? '1px solid var(--line)' : 'none',
                    }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-3 mt-2">Outlined cells are office hours, 10am–7pm. Everything outside them is a call the studio would have missed.</p>
    </div>
  );
}
