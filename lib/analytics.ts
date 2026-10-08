import { formatInTimeZone } from 'date-fns-tz';
import { sql } from './db';
import { n } from './leads';
import { estimateMidpoint } from './pricing';
import { OPEN_STAGES, STAGES, WON_STAGES, type Stage } from './stages';
import { TZ } from './time';

export type Row = {
  id: string;
  ticket_no: string;
  created_at: string;
  started_at: string | null;
  duration_s: number | null;
  ended_reason: string | null;
  grade: string | null;
  gemini_grade: string | null;
  stage: Stage;
  assigned_to: string | null;
  first_contact_at: string | null;
  booked_at: string | null;
  callback_due_at: string | null;
  callback_done_at: string | null;
  est_min_inr: string | null;
  est_max_inr: string | null;
  deal_value_inr: string | null;
  cost_inr: string;
  price_mentioned: boolean;
  hubspot_sync_error: string | null;
  fields: Record<string, any>;
  flags: string[];
  off_script_questions: string[];
};

export async function loadRows(): Promise<Row[]> {
  return sql<Row>(
    `select id, ticket_no, created_at, started_at, duration_s, ended_reason, grade, gemini_grade, stage,
            assigned_to, first_contact_at, booked_at, callback_due_at, callback_done_at,
            est_min_inr::text, est_max_inr::text, deal_value_inr::text, cost_inr::text,
            price_mentioned, hubspot_sync_error, fields, flags, off_script_questions
     from leads order by created_at desc limit 5000`
  );
}

const istKey = (d: string, p: string) => formatInTimeZone(new Date(d), TZ, p);

export function window(rows: Row[], days: number, offsetDays = 0) {
  const end = Date.now() - offsetDays * 86_400_000;
  const start = end - days * 86_400_000;
  return rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= start && t < end;
  });
}

export function kpis(rows: Row[]) {
  const week = window(rows, 7);
  const month = window(rows, 30);
  const prevMonth = window(rows, 30, 30);

  const mix = (set: Row[]) => ({
    HOT: set.filter((r) => r.grade === 'HOT').length,
    WARM: set.filter((r) => r.grade === 'WARM').length,
    LOW: set.filter((r) => r.grade === 'LOW').length,
    ESCALATE: set.filter((r) => r.grade === 'ESCALATE').length,
  });

  const cost = (set: Row[]) => set.reduce((a, r) => a + Number(r.cost_inr ?? 0), 0);
  const hot = (set: Row[]) => set.filter((r) => r.grade === 'HOT').length;

  // The brief asks for "% answered within 5 min". The agent picks up on the
  // first ring, so the only way a caller is not answered in time is a call that
  // dropped, errored or stayed silent. That is what this measures.
  const answered = (set: Row[]) =>
    set.length === 0
      ? 100
      : Math.round(
          (set.filter((r) => (r.duration_s ?? 0) >= 20 && !/fail|no_answer|error|busy/i.test(r.ended_reason ?? '')).length /
            set.length) *
            100
        );

  const open = rows.filter((r) => OPEN_STAGES.includes(r.stage));
  const pipeline = open.reduce((a, r) => a + (estimateMidpoint(n(r.est_min_inr), n(r.est_max_inr)) ?? 0), 0);

  const closed = rows.filter((r) => WON_STAGES.includes(r.stage) || r.stage === 'Not converted');
  const won = rows.filter((r) => WON_STAGES.includes(r.stage));
  const conversionRate = closed.length ? won.length / closed.length : 0;
  const revenue = won.reduce((a, r) => a + (n(r.deal_value_inr) ?? 0), 0);

  return {
    week: { count: week.length, mix: mix(week), cost: cost(week), hot: hot(week), answered: answered(week) },
    month: { count: month.length, mix: mix(month), cost: cost(month), hot: hot(month), answered: answered(month) },
    prevMonth: { count: prevMonth.length, cost: cost(prevMonth), hot: hot(prevMonth) },
    costPerLead: month.length ? cost(month) / month.length : 0,
    costPerHot: hot(month) ? cost(month) / hot(month) : 0,
    pipeline,
    conversionRate,
    forecast: Math.round(pipeline * conversionRate),
    convertedCount: won.length,
    revenue,
  };
}

export function leadsOverTime(rows: Row[], days = 30) {
  const buckets = new Map<string, { date: string; HOT: number; WARM: number; LOW: number; ESCALATE: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const key = formatInTimeZone(new Date(Date.now() - i * 86_400_000), TZ, 'yyyy-MM-dd');
    buckets.set(key, { date: key, HOT: 0, WARM: 0, LOW: 0, ESCALATE: 0 });
  }
  for (const r of window(rows, days)) {
    const b = buckets.get(istKey(r.created_at, 'yyyy-MM-dd'));
    if (b && r.grade && r.grade in b) (b as any)[r.grade]++;
  }
  return [...buckets.values()].map((b) => ({ ...b, label: b.date.slice(5) }));
}

export function byLocality(rows: Row[], limit = 8) {
  const map = new Map<string, { name: string; HOT: number; total: number }>();
  for (const r of rows) {
    const key = r.fields?.locality ?? 'Not stated';
    const e = map.get(key) ?? { name: key, HOT: 0, total: 0 };
    e.total++;
    if (r.grade === 'HOT') e.HOT++;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export function bySource(rows: Row[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.fields?.source ?? 'not asked';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/**
 * Every stage each lead has ever been moved into, from the event log. A lead
 * that was lost at Proposal must still count toward Proposal in the funnel —
 * its current stage alone would hide that.
 */
export async function loadStageReach(): Promise<Map<string, string[]>> {
  const rows = await sql<{ lead_id: string; to_stage: string }>(
    "select lead_id, to_stage from lead_events where type = 'stage_change' and to_stage is not null"
  );
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.lead_id, [...(map.get(r.lead_id) ?? []), r.to_stage]);
  return map;
}

export function funnel(rows: Row[], reach: Map<string, string[]> = new Map()) {
  const order: string[] = STAGES.filter((s) => s !== 'Not converted');

  // How far this lead actually got, ignoring the fact that it was later lost.
  const furthest = (r: Row) => {
    const seen = [r.stage, ...(reach.get(r.id) ?? [])].filter((s) => s !== 'Not converted');
    return seen.reduce((best, s) => Math.max(best, order.indexOf(s)), 0);
  };

  return order
    .map((stage, i) => ({ stage, count: rows.filter((r) => furthest(r) >= i).length }))
    .map((d, i, all) => ({
      ...d,
      dropoff: i === 0 || all[i - 1].count === 0 ? 0 : Math.round((1 - d.count / all[i - 1].count) * 100),
    }));
}

export function costVsRevenue(rows: Row[], months = 6) {
  const buckets = new Map<string, { month: string; cost: number; revenue: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = formatInTimeZone(d, TZ, 'yyyy-MM');
    buckets.set(key, { month: formatInTimeZone(d, TZ, 'MMM'), cost: 0, revenue: 0 });
  }
  for (const r of rows) {
    const b = buckets.get(istKey(r.created_at, 'yyyy-MM'));
    if (!b) continue;
    b.cost += Number(r.cost_inr ?? 0);
    if (WON_STAGES.includes(r.stage)) b.revenue += n(r.deal_value_inr) ?? 0;
  }
  return [...buckets.values()];
}

export function heatmap(rows: Row[]) {
  const grid: { day: number; hour: number; count: number }[] = [];
  const key = (d: number, h: number) => `${d}-${h}`;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = Number(istKey(r.started_at ?? r.created_at, 'i'));
    const h = Number(istKey(r.started_at ?? r.created_at, 'H'));
    counts.set(key(d, h), (counts.get(key(d, h)) ?? 0) + 1);
  }
  for (let d = 1; d <= 7; d++) for (let h = 0; h < 24; h++) grid.push({ day: d, hour: h, count: counts.get(key(d, h)) ?? 0 });
  return grid;
}

export function team(rows: Row[], users: { email: string; name: string; role: string }[]) {
  return users
    .filter((u) => u.role === 'designer')
    .map((u) => {
      const mine = rows.filter((r) => r.assigned_to === u.email);
      const times = mine
        .filter((r) => r.first_contact_at)
        .map((r) => new Date(r.first_contact_at!).getTime() - new Date(r.created_at).getTime())
        .sort((a, b) => a - b);
      const median = times.length ? times[Math.floor(times.length / 2)] / 60000 : null;
      return {
        name: u.name,
        email: u.email,
        claimed: mine.length,
        medianFirstContactMin: median == null ? null : Math.round(median),
        consultations: mine.filter((r) => r.booked_at || r.stage === 'Consultation booked').length,
        conversions: mine.filter((r) => WON_STAGES.includes(r.stage)).length,
      };
    })
    .sort((a, b) => b.claimed - a.claimed);
}

/** The health strip — the four numbers that say whether the system is behaving. */
export function health(rows: Row[]) {
  const month = window(rows, 30);
  const graded = month.filter((r) => r.grade && r.gemini_grade);
  // Only judge a promise once it has been kept or has actually come due. A
  // callback owed in forty minutes is not a miss, and counting it as one made
  // the health strip read red on a board that was behaving.
  const answered = (r: Row) => r.callback_done_at ?? r.first_contact_at;
  const callbacks = rows.filter((r) => r.callback_due_at && (answered(r) || new Date(r.callback_due_at!) < new Date()));
  const onTime = callbacks.filter((r) => answered(r) && new Date(answered(r)!) <= new Date(r.callback_due_at!));
  return {
    pricesSpoken: month.filter((r) => r.price_mentioned).length,
    callbacksOnTime: callbacks.length ? Math.round((onTime.length / callbacks.length) * 100) : 100,
    gradeAgreement: graded.length ? Math.round((graded.filter((r) => r.grade === r.gemini_grade).length / graded.length) * 100) : 100,
    hubspotFailures: rows.filter((r) => r.hubspot_sync_error).length,
  };
}

/** 3–5 bullets, computed in code — never invented by a model. */
export function insights(rows: Row[]): string[] {
  const out: string[] = [];
  const month = window(rows, 30);

  const stuck = rows.filter(
    (r) => r.grade === 'HOT' && r.stage === 'New' && Date.now() - new Date(r.created_at).getTime() > 3_600_000
  );
  if (stuck.length) out.push(`${stuck.length} hot lead${stuck.length > 1 ? 's have' : ' has'} been sitting in New for over an hour.`);

  const hot = month.filter((r) => r.grade === 'HOT');
  if (hot.length >= 3) {
    const tally = new Map<string, number>();
    for (const r of hot) tally.set(r.fields?.locality ?? 'unknown', (tally.get(r.fields?.locality ?? 'unknown') ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const share = Math.round((top.reduce((a, [, c]) => a + c, 0) / hot.length) * 100);
    if (share >= 30) out.push(`${top.map(([k]) => k).join(' + ')} are ${share}% of this month's hot leads.`);
  }

  const low = month.filter((r) => r.grade === 'LOW');
  if (low.length >= 3) {
    const belowBudget = low.filter((r) => r.flags?.includes('BUDGET')).length;
    const outOfArea = low.filter((r) => r.flags?.includes('OUT_OF_AREA')).length;
    const outOfScope = low.filter((r) => r.flags?.includes('OUT_OF_SCOPE')).length;
    const top = [
      ['budget below the band', belowBudget],
      ['outside Pune and PCMC', outOfArea],
      ['something we do not do', outOfScope],
    ].sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    if (Number(top[1]) > 0) out.push(`Most low leads this month failed on ${top[0]} (${top[1]} of ${low.length}).`);
  }

  const offScript = month.flatMap((r) => r.off_script_questions ?? []);
  if (offScript.length >= 3) out.push(`${offScript.length} callers asked something the agent could not answer — worth adding to the rubric.`);

  const noBudget = month.filter((r) => !r.fields?.budget_volunteered).length;
  if (month.length >= 5) out.push(`${Math.round((noBudget / month.length) * 100)}% of callers did not name a budget — those stay Warm by design.`);

  const booked = month.filter((r) => r.booked_at).length;
  if (month.length >= 5) out.push(`${Math.round((booked / month.length) * 100)}% of callers booked a consultation inside the call.`);

  return out.slice(0, 5);
}
