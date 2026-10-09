import { formatInTimeZone } from 'date-fns-tz';
import { health, insights, kpis, loadRows, window as lastDays, type Row } from './analytics';
import { estimateMidpoint, inr } from './pricing';
import { n } from './leads';
import { OPEN_STAGES, WON_STAGES } from './stages';
import { TZ } from './time';

/**
 * Nikhil's daily status. The highlight is capped at 70 words on purpose — it is
 * read on a phone at 9pm, so it has to be the single most useful thing about
 * today, not a report. Everything else lives in the download.
 */
export const HIGHLIGHT_WORD_LIMIT = 70;

export type DailyBrief = {
  dateLabel: string;
  highlight: string;
  highlightWords: number;
  numbers: { label: string; value: string }[];
  bullets: string[];
  rows: Row[];
  today: Row[];
};

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Adds sentences in priority order and stops before it breaks the word cap. */
function buildHighlight(sentences: string[], limit = HIGHLIGHT_WORD_LIMIT): string {
  const out: string[] = [];
  for (const s of sentences) {
    if (!s) continue;
    if (wordCount([...out, s].join(' ')) > limit) break;
    out.push(s);
  }
  return out.join(' ');
}

export async function buildDailyBrief(now = new Date()): Promise<DailyBrief> {
  const rows = await loadRows();
  const k = kpis(rows);
  const h = health(rows);

  const todayKey = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const today = rows.filter((r) => formatInTimeZone(new Date(r.created_at), TZ, 'yyyy-MM-dd') === todayKey);

  const hot = today.filter((r) => r.grade === 'HOT').length;
  const booked = today.filter((r) => r.booked_at).length;
  const escalations = rows.filter((r) => r.grade === 'ESCALATE' && r.stage === 'New').length;
  const hotStuck = rows.filter(
    (r) => r.grade === 'HOT' && r.stage === 'New' && Date.now() - new Date(r.created_at).getTime() > 3_600_000
  ).length;
  const overdue = rows.filter(
    (r) => r.callback_due_at && !r.callback_done_at && !r.first_contact_at && new Date(r.callback_due_at) < now
  ).length;
  const costToday = today.reduce((a, r) => a + Number(r.cost_inr ?? 0), 0);

  // Busiest locality today, only when it is actually a pattern.
  const byPlace = new Map<string, number>();
  for (const r of today) {
    const p = r.fields?.locality;
    if (p) byPlace.set(p, (byPlace.get(p) ?? 0) + 1);
  }
  const top = [...byPlace.entries()].sort((a, b) => b[1] - a[1])[0];

  // Ordered by how much Nikhil needs to know it. The cap trims from the bottom.
  const highlight = buildHighlight([
    today.length === 0
      ? 'No calls came in today.'
      : `${today.length} ${today.length === 1 ? 'call' : 'calls'} today — ${hot} hot, ${booked} booked a consultation on the call.`,
    h.pricesSpoken > 0 ? `⚠️ The agent said a price on ${h.pricesSpoken} ${h.pricesSpoken === 1 ? 'call' : 'calls'}.` : '',
    escalations > 0 ? `${escalations} existing ${escalations === 1 ? 'client is' : 'clients are'} waiting on a call back.` : '',
    hotStuck > 0 ? `${hotStuck} hot ${hotStuck === 1 ? 'lead has' : 'leads have'} sat unclaimed over an hour.` : '',
    overdue > 0 ? `${overdue} promised ${overdue === 1 ? 'callback is' : 'callbacks are'} overdue.` : '',
    top && top[1] > 1 ? `${top[0]} led the day with ${top[1]}.` : '',
    today.length > 0 ? `Cost ${inr(Math.round(costToday))}.` : '',
    hotStuck === 0 && overdue === 0 && escalations === 0 && today.length > 0 ? 'Nothing is waiting on anyone.' : '',
  ]);

  const openPipeline = rows
    .filter((r) => OPEN_STAGES.includes(r.stage))
    .reduce((a, r) => a + (estimateMidpoint(n(r.est_min_inr), n(r.est_max_inr)) ?? 0), 0);

  return {
    dateLabel: formatInTimeZone(now, TZ, 'EEEE d MMMM yyyy'),
    highlight,
    highlightWords: wordCount(highlight),
    numbers: [
      { label: 'Calls today', value: String(today.length) },
      { label: 'Hot today', value: String(hot) },
      { label: 'Booked in the call', value: String(booked) },
      { label: 'Cost today', value: inr(Math.round(costToday)) },
      { label: 'Leads this month', value: String(k.month.count) },
      { label: 'Open pipeline', value: inr(openPipeline) },
      { label: 'Converted', value: `${k.convertedCount} · ${inr(k.revenue)}` },
      { label: 'Prices spoken', value: String(h.pricesSpoken) },
    ],
    bullets: insights(rows),
    rows,
    today,
  };
}

/** The full detail, as a file Nikhil can keep. */
export function briefAsMarkdown(b: DailyBrief): string {
  const line = (r: Row) =>
    `| ${r.ticket_no} | ${r.fields?.caller_name ?? '—'} | ${r.grade ?? 'ungraded'} | ${r.fields?.locality ?? '—'} | ${
      r.fields?.carpet_area_sqft ? `${r.fields.carpet_area_sqft} sq ft` : '—'
    } | ${r.stage} | ${r.booked_at ? formatInTimeZone(new Date(r.booked_at), TZ, 'd MMM h:mma') : '—'} |`;

  const month = lastDays(b.rows, 30);

  return [
    `# Aangan Leads — ${b.dateLabel}`,
    '',
    b.highlight,
    '',
    '## Today at a glance',
    '',
    '| | |',
    '|---|---|',
    ...b.numbers.map((x) => `| ${x.label} | ${x.value} |`),
    '',
    '## What stands out',
    '',
    ...(b.bullets.length ? b.bullets.map((x) => `- ${x}`) : ['- Nothing unusual.']),
    '',
    `## Today's calls (${b.today.length})`,
    '',
    b.today.length
      ? ['| Ticket | Caller | Grade | Locality | Area | Stage | Consultation |', '|---|---|---|---|---|---|---|', ...b.today.map(line)].join('\n')
      : 'No calls today.',
    '',
    `## Open leads needing attention`,
    '',
    (() => {
      const needs = b.rows.filter(
        (r) => (r.grade === 'HOT' && r.stage === 'New') || r.grade === 'ESCALATE' || (r.callback_due_at && !r.callback_done_at && !r.first_contact_at)
      );
      return needs.length
        ? ['| Ticket | Caller | Grade | Stage | Why |', '|---|---|---|---|---|', ...needs.map((r) =>
            `| ${r.ticket_no} | ${r.fields?.caller_name ?? '—'} | ${r.grade} | ${r.stage} | ${
              r.grade === 'ESCALATE' ? 'existing client' : r.stage === 'New' ? 'unclaimed' : 'callback owed'
            } |`
          )].join('\n')
        : 'Nothing is waiting on anyone.';
    })(),
    '',
    '---',
    '',
    `Internal — never share. Estimates are indicative and must not reach a caller.`,
    `${month.length} leads in the last 30 days.`,
    '',
  ].join('\n');
}

export function briefAsCsv(b: DailyBrief): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['ticket_no', 'caller_name', 'grade', 'locality', 'property_type', 'carpet_area_sqft', 'scope', 'budget_fit', 'stage', 'assigned_to', 'booked_at', 'cost_inr', 'created_at'];
  const rows = b.rows.map((r) =>
    [
      r.ticket_no,
      r.fields?.caller_name,
      r.grade,
      r.fields?.locality,
      r.fields?.property_type,
      r.fields?.carpet_area_sqft,
      r.fields?.scope,
      (r as any).budget_fit,
      r.stage,
      r.assigned_to,
      r.booked_at,
      r.cost_inr,
      r.created_at,
    ].map(esc).join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
