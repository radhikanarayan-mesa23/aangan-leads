import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { listUsers } from '@/lib/leads';
import { Chrome } from '@/components/Chrome';
import { InternalBadge } from '@/components/Chips';
import { CostVsRevenue, FunnelChart, Heatmap, LeadsOverTime, LocalityChart, SourceChart } from '@/components/OwnerCharts';
import { byLocality, bySource, costVsRevenue, funnel, health, heatmap, insights, kpis, leadsOverTime, loadRows, loadStageReach, team } from '@/lib/analytics';
import { inr } from '@/lib/pricing';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function OwnerPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'owner') redirect('/board?denied=owner');

  const [rows, users, reach] = await Promise.all([loadRows(), listUsers(), loadStageReach()]);
  const k = kpis(rows);
  const h = health(rows);
  const bullets = insights(rows);

  const deltaLeads = pct(k.month.count, k.prevMonth.count);
  const deltaCost = pct(k.month.cost, k.prevMonth.cost);

  return (
    <Chrome user={user} active="owner">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-ink-2">Last 30 days, with this week alongside. All times IST.</p>
        </div>
        <InternalBadge />
      </div>

      {/* KPI row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Leads in" value={k.month.count} sub={`${k.week.count} this week`} delta={deltaLeads} />
        <Kpi
          label="Hot / Warm / Low"
          value={`${k.month.mix.HOT} / ${k.month.mix.WARM} / ${k.month.mix.LOW}`}
          sub={k.month.mix.ESCALATE ? `${k.month.mix.ESCALATE} escalated` : 'none escalated'}
        />
        <Kpi label="Answered live" value={`${k.month.answered}%`} sub="calls that got a real conversation" />
        <Kpi label="Total AI cost" value={inr(Math.round(k.month.cost))} sub={`${inr(Math.round(k.costPerLead))} per lead`} delta={deltaCost} invert />
        <Kpi label="Cost per hot lead" value={inr(Math.round(k.costPerHot))} sub={`${k.month.hot} hot this month`} />
        <Kpi label="Pipeline value" value={inr(k.pipeline)} sub="internal estimate midpoints, open leads" internal />
        <Kpi label="Forecast" value={inr(k.forecast)} sub={`pipeline × ${Math.round(k.conversionRate * 100)}% close rate`} internal />
        <Kpi label="Converted" value={`${k.convertedCount} · ${inr(k.revenue)}`} sub={`${Math.round(k.conversionRate * 100)}% of closed leads`} />
      </section>

      {/* health strip */}
      <section className="mt-3 card p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Health ok={h.pricesSpoken === 0} label="Prices spoken" value={`${h.pricesSpoken}`} target="target 0" />
        <Health ok={h.callbacksOnTime >= 95} label="Callbacks on time" value={`${h.callbacksOnTime}%`} target="target 95%" />
        <Health ok={h.gradeAgreement >= 95} label="Gemini agrees with code" value={`${h.gradeAgreement}%`} target="target 95%" />
        <Health ok={h.hubspotFailures === 0} label="HubSpot sync failures" value={`${h.hubspotFailures}`} target="target 0" />
      </section>

      {/* insights */}
      {bullets.length > 0 && (
        <section className="mt-3 card p-4">
          <p className="label mb-2">What stands out</p>
          <ul className="space-y-1.5 text-sm leading-relaxed">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ink-3">—</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* charts */}
      <div className="mt-3 grid lg:grid-cols-2 gap-3">
        <Panel title="Leads over time" note="stacked by grade, last 30 days">
          <LeadsOverTime data={leadsOverTime(rows)} />
        </Panel>
        <Panel title="Funnel" note="drop-off at each step">
          <FunnelChart data={funnel(rows, reach)} />
        </Panel>
        <Panel title="Where leads come from" note="by locality — the darker bar is hot">
          <LocalityChart data={byLocality(rows)} />
        </Panel>
        <Panel title="How they heard about us" note="only when it came up in the call">
          <SourceChart data={bySource(rows)} />
        </Panel>
        <Panel title="Cost vs revenue" note="AI cost against won deals, by month">
          <CostVsRevenue data={costVsRevenue(rows)} />
        </Panel>
        <Panel title="When people call" note="calls by hour and weekday">
          <Heatmap data={heatmap(rows)} />
        </Panel>
      </div>

      {/* team */}
      <section className="mt-3 card p-4 overflow-x-auto scrollbar-thin">
        <p className="label mb-3">Team</p>
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left text-ink-3 text-xs">
              <th className="font-medium pb-2">Designer</th>
              <th className="font-medium pb-2 text-right">Claimed</th>
              <th className="font-medium pb-2 text-right">Median time to first contact</th>
              <th className="font-medium pb-2 text-right">Consultations</th>
              <th className="font-medium pb-2 text-right">Conversions</th>
            </tr>
          </thead>
          <tbody>
            {team(rows, users).map((t) => (
              <tr key={t.email} className="border-t border-line">
                <td className="py-2">{t.name}</td>
                <td className="py-2 text-right tabular-nums">{t.claimed}</td>
                <td className="py-2 text-right tabular-nums">{t.medianFirstContactMin == null ? '—' : `${t.medianFirstContactMin}m`}</td>
                <td className="py-2 text-right tabular-nums">{t.consultations}</td>
                <td className="py-2 text-right tabular-nums">{t.conversions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Chrome>
  );
}

function pct(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

function Kpi({
  label,
  value,
  sub,
  delta,
  invert,
  internal,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number | null;
  invert?: boolean;
  internal?: boolean;
}) {
  const good = delta == null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="label">{label}</p>
        {internal && <span className="text-[10px] text-ink-3 border border-dashed border-line rounded-chip px-1.5">internal</span>}
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">
        {sub}
        {delta != null && (
          <span className={cn('ml-2', good ? 'text-[var(--ok)]' : 'text-[var(--hot)]')}>
            {delta > 0 ? '+' : ''}
            {delta}% vs last month
          </span>
        )}
      </p>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3">
        <p className="text-sm font-medium">{title}</p>
        {note && <p className="text-xs text-ink-3">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Health({ ok, label, value, target }: { ok: boolean; label: string; value: string; target: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-2 rounded-full')} style={{ background: ok ? 'var(--ok)' : 'var(--hot)' }} />
      <span className="text-ink-2">{label}</span>
      <b className="tabular-nums">{value}</b>
      <span className="text-xs text-ink-3">{target}</span>
    </span>
  );
}
