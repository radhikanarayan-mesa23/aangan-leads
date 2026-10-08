// ─────────────────────────────────────────────────────────────────────────────
// NEVER REACHES A CALLER-FACING SURFACE.
// Bands come from source/pricing.md via rubric.md §7. The agent never sees this
// file's output; it appears only on the Designer Board and Owner Dashboard,
// always labelled "internal — never share".
// ─────────────────────────────────────────────────────────────────────────────

export type Scope = 'full_home' | 'partial' | 'single_room' | 'painting' | 'office' | 'other';
export type Tier = 'standard' | 'premium' | 'luxury';
export type BudgetFit = 'fits' | 'close' | 'below' | 'unknown';

export const RESIDENTIAL = {
  standard: { min: 1800, max: 2400 },
  premium: { min: 2400, max: 3500 },
  luxury: { min: 3500, max: 5000 }, // pricing.md says "3,500+"; 5,000 models the top for est_max
} as const;

export const COMMERCIAL = {
  standard: { min: 1200, max: 1800 }, // "Basic fitout"
  premium: { min: 1800, max: 2800 }, // "Mid-range office"
  luxury: { min: 2800, max: 4000 }, // "Premium office"
} as const;

/** pricing.md: "Single room redesign (all-in): ₹3.5 lakh – ₹8 lakh". */
export const SINGLE_ROOM = { min: 350_000, max: 800_000 } as const;

export const LARGE_SQFT = 2000; // rubric.md §9 — ASSUME, confirm with Nikhil

/** Premium/luxury words in the caller's stated style move est_max up a band. */
export function tierFromStyle(style?: string | null): Tier {
  const s = (style ?? '').toLowerCase();
  if (/luxur|bespoke|imported|high[- ]?end|opulent|italian marble/.test(s)) return 'luxury';
  if (/premium|upscale|designer|classy|rich|teak|solid wood/.test(s)) return 'premium';
  return 'standard';
}

export type EstimateInput = {
  carpet_area_sqft?: number | null;
  scope?: Scope | null;
  property_type?: string | null;
  style?: string | null;
  /** Area of the rooms being done, when the caller gave it for a partial job. */
  partial_area_sqft?: number | null;
};

export type Estimate = {
  est_min_inr: number | null;
  est_max_inr: number | null;
  basis: string;
  tier: Tier;
  commercial: boolean;
};

export function isCommercial(propertyType?: string | null, scope?: Scope | null): boolean {
  if (scope === 'office') return true;
  return /office|clinic|studio|commercial|shop|workspace/i.test(propertyType ?? '');
}

/** rubric.md §7 — conservative by design: est_min always uses the band minimum. */
export function estimate(input: EstimateInput): Estimate {
  const tier = tierFromStyle(input.style);
  const commercial = isCommercial(input.property_type, input.scope);
  const bands = commercial ? COMMERCIAL : RESIDENTIAL;
  const scope = input.scope ?? null;

  if (scope === 'single_room') {
    return {
      est_min_inr: SINGLE_ROOM.min,
      est_max_inr: SINGLE_ROOM.max,
      basis: 'Single-room all-in band (₹3.5L–₹8L), area not required',
      tier,
      commercial,
    };
  }

  if (scope === 'painting') {
    return { est_min_inr: null, est_max_inr: null, basis: 'Painting only is out of scope — no estimate', tier, commercial };
  }

  const area =
    scope === 'partial'
      ? input.partial_area_sqft ?? null // never estimate a partial job from whole-home area
      : input.carpet_area_sqft ?? null;

  if (!area || area <= 0) {
    return {
      est_min_inr: null,
      est_max_inr: null,
      basis: scope === 'partial' ? 'Partial scope with no room area given' : 'No carpet area given',
      tier,
      commercial,
    };
  }

  const minRate = bands.standard.min;
  const maxRate = bands[tier].max;
  return {
    est_min_inr: Math.round(area * minRate),
    est_max_inr: Math.round(area * maxRate),
    basis: `${area} sq ft × ₹${minRate.toLocaleString('en-IN')} (${commercial ? 'commercial basic' : 'residential standard'} minimum) — ₹${maxRate.toLocaleString('en-IN')} (${tier})`,
    tier,
    commercial,
  };
}

/** rubric.md §7 budget-fit table. The code's answer is final (rubric.md §9). */
export function budgetFit(est_min: number | null, budget_max?: number | null): BudgetFit {
  if (!est_min || !budget_max || budget_max <= 0) return 'unknown';
  if (budget_max >= est_min) return 'fits';
  if (budget_max >= 0.8 * est_min) return 'close';
  return 'below';
}

/** Midpoint of the internal estimate — the unit the owner's pipeline value is in. */
export function estimateMidpoint(min: number | null, max: number | null): number | null {
  if (min == null && max == null) return null;
  if (min == null) return max;
  if (max == null) return min;
  return Math.round((min + max) / 2);
}

export function inr(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n}`;
}
