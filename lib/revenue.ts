import type { Row } from './analytics';
import { n } from './leads';
import { WON_STAGES } from './stages';
import { humanScope } from './telegram';

/**
 * What kind of work actually pays.
 *
 * The rest of the dashboard is about leads. This is about money: which property
 * types and scopes Nikhil wins, what each is worth, and whether answering the
 * phone returns more than it costs.
 *
 * Every function reports how much it had to work with. A donut drawn from two
 * won deals looks authoritative and means nothing, so the UI is told when to
 * say "too few to read" instead of drawing a confident chart.
 */

/** A sample smaller than this is not a pattern. */
export const CONFIDENT_AT = 5;

export type Slice = {
  key: string;
  label: string;
  /** Won projects of this kind. */
  won: number;
  /** All leads of this kind, won or not. */
  leads: number;
  revenue: number;
  avgValue: number | null;
  /** won / (won + lost), null when nothing has closed. */
  winRate: number | null;
  /** The denominator. A 100% win rate off one deal is arithmetic, not evidence. */
  closed: number;
};

export type Breakdown = {
  slices: Slice[];
  total: number;
  sample: number;
  confident: boolean;
  /** What to say when there is not enough to go on. */
  caveat: string | null;
};

/** "3 BHK", "3bhk", "3 bedroom" all become "3BHK"; villas and offices stand apart. */
export function normalisePropertyType(raw?: string | null): { key: string; label: string } {
  const s = (raw ?? '').toLowerCase().trim();
  if (!s) return { key: 'unknown', label: 'Not stated' };
  if (/villa|bungalow|row ?house|independent/.test(s)) return { key: 'villa', label: 'Villa / bungalow' };
  if (/office|clinic|studio|commercial|workspace/.test(s)) return { key: 'office', label: 'Office / clinic' };
  const bhk = s.match(/(\d)\s*(bhk|bedroom|bed)/);
  if (bhk) return { key: `${bhk[1]}bhk`, label: `${bhk[1]}BHK` };
  const bare = s.match(/^(\d)\s*$/);
  if (bare) return { key: `${bare[1]}bhk`, label: `${bare[1]}BHK` };
  return { key: 'other', label: 'Other' };
}

function build(groups: Map<string, { label: string; rows: Row[] }>): Breakdown {
  const slices: Slice[] = [...groups.entries()]
    .map(([key, g]) => {
      const won = g.rows.filter((r) => WON_STAGES.includes(r.stage));
      const lost = g.rows.filter((r) => r.stage === 'Not converted');
      const revenue = won.reduce((a, r) => a + (n(r.deal_value_inr) ?? 0), 0);
      const closed = won.length + lost.length;
      return {
        key,
        label: g.label,
        won: won.length,
        leads: g.rows.length,
        revenue,
        avgValue: won.length ? Math.round(revenue / won.length) : null,
        winRate: closed ? won.length / closed : null,
        closed,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

  const total = slices.reduce((a, s) => a + s.revenue, 0);
  const sample = slices.reduce((a, s) => a + s.won, 0);
  const confident = sample >= CONFIDENT_AT;

  return {
    slices,
    total,
    sample,
    confident,
    caveat: confident
      ? null
      : sample === 0
        ? 'No projects won yet — this fills in as deals close.'
        : `${sample} won project${sample > 1 ? 's' : ''} so far — too few to read a pattern.`,
  };
}

export function revenueByPropertyType(rows: Row[]): Breakdown {
  const groups = new Map<string, { label: string; rows: Row[] }>();
  for (const r of rows) {
    const { key, label } = normalisePropertyType(r.fields?.property_type);
    if (key === 'unknown') continue;
    if (!groups.has(key)) groups.set(key, { label, rows: [] });
    groups.get(key)!.rows.push(r);
  }
  return build(groups);
}

export function revenueByScope(rows: Row[]): Breakdown {
  const groups = new Map<string, { label: string; rows: Row[] }>();
  for (const r of rows) {
    const scope = r.fields?.scope;
    if (!scope) continue;
    const label = humanScope(scope) ?? scope;
    if (!groups.has(scope)) groups.set(scope, { label: label[0].toUpperCase() + label.slice(1), rows: [] });
    groups.get(scope)!.rows.push(r);
  }
  return build(groups);
}

/**
 * Did answering the phone pay for itself?
 *
 * Deliberately compares won revenue against the FULL AI spend, not just the
 * spend on the calls that converted — the cost of the leads that went nowhere
 * is part of what the wins had to cover.
 */
export function returnOnCalls(rows: Row[]) {
  const spend = rows.reduce((a, r) => a + Number(r.cost_inr ?? 0), 0);
  const won = rows.filter((r) => WON_STAGES.includes(r.stage));
  const revenue = won.reduce((a, r) => a + (n(r.deal_value_inr) ?? 0), 0);
  const perRupee = spend > 0 ? revenue / spend : null;
  return {
    spend,
    revenue,
    wonCount: won.length,
    perRupee,
    costPerWon: won.length ? spend / won.length : null,
    /** One won project covers the whole spend many times over, so be plain about it. */
    confident: won.length > 0 && spend > 0,
  };
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi', other: 'Other' };

/**
 * What language callers actually use — and whether it changes the outcome.
 *
 * A lead is counted under the language the caller OPENED in, because that is
 * what the agent had to handle first and what a human receptionist would have
 * needed to speak. Calls where they switched are counted separately, since
 * switching is the hard case for a voice agent and worth watching on its own.
 */
export function languageMix(rows: Row[]) {
  const groups = new Map<string, { label: string; rows: Row[] }>();
  let switched = 0;
  let known = 0;

  for (const r of rows) {
    const langs: string[] = r.fields?.languages ?? [];
    if (!langs.length) continue;
    known++;
    if (r.fields?.language_switched || langs.length > 1) switched++;
    const first = langs[0];
    const label = LANGUAGE_NAMES[first] ?? first;
    if (!groups.has(first)) groups.set(first, { label, rows: [] });
    groups.get(first)!.rows.push(r);
  }

  const breakdown = build(groups);
  // Callers matter here more than revenue — the question is who rings, not who pays.
  const slices = breakdown.slices
    .map((s) => ({ ...s }))
    .sort((a, b) => b.leads - a.leads);

  return {
    ...breakdown,
    slices,
    known,
    switched,
    switchedShare: known ? switched / known : 0,
    /** Enough callers to say anything about the mix. */
    confident: known >= CONFIDENT_AT,
    caveat: known >= CONFIDENT_AT ? null : `${known} call${known === 1 ? '' : 's'} with a language recorded — too few to read a pattern.`,
  };
}
