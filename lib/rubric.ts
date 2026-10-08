import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Hard rule: code never hardcodes grading criteria — it reads rubric.md.
// This module is the only parser. Everything else asks it.

let cache: { text: string; parsed: ParsedRubric } | null = null;

export type ParsedRubric = {
  servedLocalities: string[];
  caseByCase: string[];
  notServed: string[];
  scopeOffered: Record<string, boolean>;
  minLeadTimeWeeks: number;
  largeSqft: number;
  slotHours: number[];
  slotDaysAhead: number;
  warnings: string[];
};

export function rubricText(): string {
  return load().text;
}

export function rubric(): ParsedRubric {
  return load().parsed;
}

function load() {
  if (cache) return cache;
  const path = join(process.cwd(), 'rubric.md');
  const text = readFileSync(path, 'utf8');
  cache = { text, parsed: parse(text) };
  return cache;
}

/** Test seam — lets eval.ts point at a candidate rubric. */
export function loadRubricFrom(text: string) {
  cache = { text, parsed: parse(text) };
}

function parse(text: string): ParsedRubric {
  const warnings: string[] = [];

  const localitiesAfter = (label: RegExp) => {
    const m = text.match(label);
    if (!m) {
      warnings.push(`rubric.md: could not find "${label}"`);
      return [];
    }
    return m[1]
      .replace(/\*\*/g, '')
      .replace(/\([^)]*\)/g, '')
      .split(/[,.·]/)
      .map((s) => s.replace(/^\s*(and|examples?:)\s*/i, '').trim())
      // Keep place names only. Prose on the same line ("any city outside Pune /
      // PCMC", "Nikhil's reason: …") would otherwise match real localities.
      .filter((s) => s.length > 1 && s.length <= 24 && !s.includes(':') && s.split(/\s+/).length <= 3)
      .filter((s) => !/^(and )?adjoining areas$/i.test(s) && !/^any\b/i.test(s));
  };

  const servedPune = localitiesAfter(/\*\*Served — Pune city:\*\*([^\n]+)/);
  const servedPcmc = localitiesAfter(/\*\*Served — PCMC:\*\*([^\n]+)/);
  const caseByCase = localitiesAfter(/case by case[^:]*:\*\*([^\n]+)/i);
  const notServed = localitiesAfter(/\*\*Not served:\*\*([^\n]+)/);

  const scopeOffered: Record<string, boolean> = {};
  const scopeRows = text.match(/\| Scope option \| Offered\? \| Notes \|[\s\S]*?\n\n/);
  if (scopeRows) {
    for (const line of scopeRows[0].split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length < 4 || /^-+$/.test(cells[1]) || /Scope option/.test(cells[1])) continue;
      const key = scopeKey(cells[1]);
      if (key) scopeOffered[key] = /YES/i.test(cells[2]);
    }
  } else {
    warnings.push('rubric.md: scope table not found');
  }

  const lead = text.match(/Minimum lead time[^.\n]*?(\d+)\s*weeks/i);
  const large = text.match(/carpet area ≥ \*{0,2}([\d,]+)\s*sq ft/i);
  const hours = text.match(/\*\*(\d+)pm, (\d+)pm, (\d+)pm, (\d+)pm, (\d+)pm\*\*/);
  const days = text.match(/next \*\*(\d+)\*\* working days/i);

  if (!lead) warnings.push('rubric.md: minimum lead time not found, defaulting to 6 weeks');
  if (!large) warnings.push('rubric.md: large-job threshold not found, defaulting to 2000 sq ft');

  return {
    servedLocalities: dedupe([...servedPune, ...servedPcmc]),
    caseByCase: dedupe(caseByCase),
    notServed: dedupe(notServed),
    scopeOffered: Object.keys(scopeOffered).length
      ? scopeOffered
      : { full_home: true, partial: true, single_room: true, painting: false, office: true },
    minLeadTimeWeeks: lead ? Number(lead[1]) : 6,
    largeSqft: large ? Number(large[1].replace(/,/g, '')) : 2000,
    slotHours: hours ? hours.slice(1, 6).map((h) => (Number(h) === 12 ? 12 : Number(h) + 12)) : [12, 13, 14, 15, 16],
    slotDaysAhead: days ? Number(days[1]) : 5,
    warnings,
  };
}

function scopeKey(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes('full home')) return 'full_home';
  if (l.includes('partial')) return 'partial';
  if (l.includes('single room')) return 'single_room';
  if (l.includes('painting')) return 'painting';
  if (l.includes('office')) return 'office';
  return null;
}

const dedupe = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];

/** pass / unclear / fail for a stated locality, per rubric.md §3. */
export function locationResult(locality?: string | null): 'pass' | 'fail' | 'unclear' {
  if (!locality) return 'unclear';
  const r = rubric();
  const l = locality.toLowerCase();
  // Word-boundary match, one way only: "Pune" must not match "outside Pune".
  const hit = (list: string[]) =>
    list.some((x) => new RegExp(`\\b${x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(l));
  if (hit(r.notServed)) return 'fail';
  if (hit(r.servedLocalities)) return 'pass';
  if (/\bpune\b|\bpcmc\b|pimpri|chinchwad/i.test(locality)) return 'unclear';
  return 'unclear';
}

export function scopeOffered(scope?: string | null): boolean | null {
  if (!scope) return null;
  const r = rubric();
  return r.scopeOffered[scope] ?? null;
}
