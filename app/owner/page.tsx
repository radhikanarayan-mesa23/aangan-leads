import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { listUsers } from '@/lib/leads';
import { Shell } from '@/components/Shell';
import { SetupNeeded } from '@/components/SetupNeeded';
import { InternalBadge } from '@/components/Chips';
import { CostVsRevenue, FunnelChart, Heatmap, LeadsOverTime, LocalityChart, SourceChart } from '@/components/OwnerCharts';
import { OwnerHero } from '@/components/OwnerHero';
import { MoneyPanel, ReturnPanel } from '@/components/MoneySection';
import { DesignerCards } from '@/components/DesignerCards';
import { returnOnCalls, revenueByPropertyType, revenueByScope } from '@/lib/revenue';
import { heroCopy } from '@/lib/hero-copy';
import { buildDailyBrief } from '@/lib/brief';
import { byLocality, bySource, costVsRevenue, funnel, health, heatmap, insights, kpis, leadsOverTime, loadRows, loadStageReach, team } from '@/lib/analytics';
import { inr } from '@/lib/pricing';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function OwnerPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role !== 'owner') redirect('/board?denied=owner');

  let rows, users, reach;
  try {
    [rows, users, reach] = await Promise.all([loadRows(), listUsers(), loadStageReach()]);
  } catch (e) {
    return <SetupNeeded detail={String(e)} />;
  }
  const k = kpis(rows);
  const h = health(rows);
  const bullets = insights(rows);

  const hotInNew = rows.filter((r) => r.grade === 'HOT' && r.stage === 'New').length;
  const awaitingCallback = rows.filter((r) => r.callback_due_at && !r.callback_done_at && !r.first_contact_at).length;
  const escalations = rows.filter((r) => r.grade === 'ESCALATE' && r.stage === 'New').length;
  const hero = heroCopy({ hotInNew, awaitingCallback, escalations, pricesSpoken: h.pricesSpoken });
  const brief = await buildDailyBrief();
  const byType = revenueByPropertyType(rows);
  const byScope = revenueByScope(rows);
  const roi = returnOnCalls(rows);
  const designers = team(rows, users);

  const deltaLeads = pct(k.month.count, k.prevMonth.count);
  const deltaCost = pct(k.month.cost, k.prevMonth.cost);

  return (
    <Shell user={user} active="owner">
      <OwnerHero
        headline={hero.headline}
        sub={hero.sub}
        stats={[
          { label: 'leads this month', value: String(k.month.count) },
          { label: 'hot leads', value: String(k.month.hot) },
          { label: 'cost per hot lead', value: inr(Math.round(k.costPerHot)) },
        ]}
        localities={byLocality(rows, 6).filter((l) => l.name !== 'Not stated')}
      />

      {/* Today's status — the same 70-word highlight Nikhil gets at 9pm. */}
      <section className="mt-4 card p-4 sm:p-5 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="label mb-1.5">Today · {brief.dateLabel}</p>
            <p className="text-[15px] leading-relaxed">{brief.highlight}</p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <a className="btn btn-primary" href="/api/owner/brief" download>
              Download today’s brief
            </a>
            <a className="btn" href="/api/owner/brief?format=csv" download>
              All leads (CSV)
            </a>
          </div>
        </div>
      </section>

      <div className="mt-6 mb-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold tracking-tight">The numbers</h2>
          <p className="text-sm text-ink-2">Last 30 days, with this week alongside. All times IST.</p>
        </div>
        <InternalBadge />
      </div>

      {/* KPI row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Leads in" value={k.month.count} sub={`${k.week.count} this week`} delta={deltaLeads} accent="var(--blue-500)" />
        <Kpi
          label="Hot / Warm / Low"
          value={
            <span className="tabular-nums">
              <span style={{ color: 'var(--hot)' }}>{k.month.mix.HOT}</span>
              <span className="text-ink-3 font-normal mx-1">/</span>
              <span style={{ color: 'var(--warm)' }}>{k.month.mix.WARM}</span>
              <span className="text-ink-3 font-normal mx-1">/</span>
              <span style={{ color: 'var(--low)' }}>{k.month.mix.LOW}</span>
            </span>
          }
          sub={k.month.mix.ESCALATE ? `${k.month.mix.ESCALATE} escalated` : 'none escalated'}
          accent="linear-gradient(90deg, var(--hot) 0%, var(--warm) 55%, var(--low) 100%)"
          wash="linear-gradient(160deg, rgba(224,57,79,0.05) 0%, rgba(224,57,79,0) 58%)"
        />
        <Kpi
          label="Answered in under 5 min"
          value={`${k.month.answered}%`}
          sub="picked up on the first ring; share that became a real conversation"
          accent={k.month.answered >= 95 ? 'var(--ok)' : 'var(--warm)'}
          wash="linear-gradient(160deg, rgba(16,135,106,0.055) 0%, rgba(16,135,106,0) 58%)"
        />
        <Kpi label="Total AI cost" value={inr(Math.round(k.month.cost))} sub={`${inr(Math.round(k.costPerLead))} per lead`} delta={deltaCost} invert accent="var(--navy-700)" />
        <Kpi label="Cost per hot lead" value={inr(Math.round(k.costPerHot))} sub={`${k.month.hot} hot this month`} accent="var(--navy-700)" />
        <Kpi label="Pipeline value" value={inr(k.pipeline)} sub="internal estimate midpoints, open leads" internal accent="var(--blue-400)" />
        <Kpi label="Forecast" value={inr(k.forecast)} sub={`pipeline × ${Math.round(k.conversionRate * 100)}% close rate`} internal accent="var(--blue-300)" />
        <Kpi
          label="Converted"
          value={`${k.convertedCount} · ${inr(k.revenue)}`}
          sub={`${Math.round(k.conversionRate * 100)}% of closed leads`}
          accent="var(--ok)"
          wash="linear-gradient(160deg, rgba(16,135,106,0.07) 0%, rgba(16,135,106,0) 58%)"
        />
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

      {/* what pays */}
      <div className="mt-7 mb-3">
        <h2 className="text-base font-semibold tracking-tight">What&rsquo;s making money</h2>
        <p className="text-sm text-ink-2">Which work actually closes, and what it is worth.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3">
          <MoneyPanel
            title="By property type"
            note="2BHK, 3BHK, villa, office — where the revenue sits"
            breakdown={byType}
          />
          <MoneyPanel
            title="By scope"
            note="full home, a few rooms, one room, office fit-out"
            breakdown={byScope}
          />
        </div>
        <ReturnPanel {...roi} />
      </div>

      {/* team */}
      <div className="mt-7 mb-3">
        <h2 className="text-base font-semibold tracking-tight">Designers</h2>
        <p className="text-sm text-ink-2">
          What each person is carrying, what they closed, and what is being let down right now.
        </p>
      </div>

      <DesignerCards team={designers} />

    </Shell>
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
  accent,
  wash,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number | null;
  invert?: boolean;
  internal?: boolean;
  /** Colour of the rule along the top — carries the palette, not the number. */
  accent?: string;
  wash?: string;
}) {
  const good = delta == null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <div
      className="kpi p-4"
      style={{ ...(accent ? { ['--kpi-accent' as string]: accent } : {}), ...(wash ? { ['--kpi-wash' as string]: wash } : {}) } as React.CSSProperties}
    >
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
