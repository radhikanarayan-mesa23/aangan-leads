import { estimate, budgetFit, LARGE_SQFT, type BudgetFit, type Scope } from './pricing';
import { locationResult, rubric, scopeOffered } from './rubric';
import type { Criteria, GeminiOutput, Grade, LeadFields } from './schema';

export type GradeResult = {
  grade: Grade;
  grade_reason: string;
  criteria: Criteria;
  flags: string[];
  est_min_inr: number | null;
  est_max_inr: number | null;
  estimate_basis: string;
  budget_fit: BudgetFit;
  disagreed_with_gemini: boolean;
  gemini_grade: Grade;
  booking_eligible: boolean;
};

/**
 * The authoritative grade. rubric.md §9: "Code overrides on maths."
 * Gemini supplies judgement (what the caller meant); code supplies arithmetic
 * and lookups (location, scope, budget fit, timeline) and has the last word.
 */
export function gradeLead(g: GeminiOutput): GradeResult {
  const r = rubric();
  const f = g.fields;
  const flags = new Set<string>(g.flags.map(normaliseFlag));

  const est = estimate({
    carpet_area_sqft: f.carpet_area_sqft,
    scope: (f.scope ?? null) as Scope | null,
    property_type: f.property_type,
    style: f.style,
    partial_area_sqft: f.partial_area_sqft ?? null,
  });
  const fit = budgetFit(est.est_min_inr, f.budget_inr_max ?? f.budget_inr_min ?? null);

  // ── C1 Location: a lookup against rubric.md §3, not a judgement call.
  const c1 = locationResult(f.locality);
  if (c1 === 'fail') flags.add('OUT_OF_AREA');

  // ── C2 Scope: Gemini decides "is this a real project"; the offered-list is a lookup.
  const offered = scopeOffered(f.scope);
  let c2: 'pass' | 'fail' | 'unclear' = g.criteria.C2.result;
  if (offered === false) {
    c2 = 'fail';
    flags.add('OUT_OF_SCOPE');
  } else if (offered === true && c2 === 'fail') {
    // Gemini failed it for a non-scope reason — advice only, or self-execution.
    flags.add('ADVICE_ONLY');
  } else if (f.scope == null) {
    c2 = 'unclear';
  }

  // ── C3 Budget: arithmetic, plus the budget floor from rubric.md §7.
  // A caller at or above the floor passes on their own, because Aangan's
  // average project sits in that band — but budget_fit keeps recording the
  // real arithmetic, so the board still shows a designer the gap.
  const statedBudget = f.budget_inr_max ?? f.budget_inr_min ?? null;
  const clearsFloor = r.hotBudgetFloorInr != null && statedBudget != null && statedBudget >= r.hotBudgetFloorInr;

  let c3: 'pass' | 'fail' | 'unclear';
  if (fit === 'fits' || clearsFloor) c3 = 'pass';
  else if (fit === 'below') c3 = 'fail';
  else c3 = 'unclear';

  if (fit === 'below' || fit === 'close') flags.add('BUDGET');
  if (clearsFloor && fit !== 'fits') flags.add('BUDGET_FLOOR');

  // ── C4 Timeline. Minimum lead time comes from rubric.md §2.
  const minMonths = r.minLeadTimeWeeks / 4.345;
  const months = f.timeline_months;
  let c4: 'pass' | 'fail' | 'unclear';
  if (months == null) {
    c4 = 'unclear';
  } else if (months > 6) {
    c4 = 'fail';
  } else if (months < minMonths) {
    if (flags.has('DEADLINE-ADJUSTED')) {
      c4 = 'unclear';
    } else {
      c4 = 'fail';
      flags.add('DEADLINE');
    }
  } else if (months <= 3) {
    c4 = 'pass';
  } else {
    c4 = 'unclear';
  }
  // "just exploring" is an explicit fail in rubric.md §8 even without a number.
  if (/just (looking|exploring|browsing)|no timeline|someday/i.test(g.criteria.C4.reason)) c4 = 'fail';

  const c5 = g.criteria.C5.result;

  const criteria: Criteria = {
    C1: { result: c1, reason: reasonFor('C1', c1, f, g) },
    C2: { result: c2, reason: g.criteria.C2.reason || reasonFor('C2', c2, f, g) },
    C3: { result: c3, reason: budgetReason(fit, est.est_min_inr, f, clearsFloor, r.hotBudgetFloorInr) },
    C4: { result: c4, reason: g.criteria.C4.reason || reasonFor('C4', c4, f, g) },
    C5: { result: c5, reason: g.criteria.C5.reason },
  };

  // ── Flags that are pure signal.
  const area = f.carpet_area_sqft ?? 0;
  if (area >= (r.largeSqft || LARGE_SQFT) || /villa|office|bungalow|row house/i.test(f.property_type ?? '')) flags.add('LARGE');
  if (f.ownership === 'rented') flags.add('RENTED');
  if (f.source === 'referral') flags.add('REFERRAL');
  if (g.off_script_questions.length > 0) flags.add('OFF_SCRIPT');
  if (g.price_mentioned) flags.add('PRICE_SPOKEN');
  if (c5 !== 'pass') flags.add('DECISION');

  // ── The ladder. rubric.md §9, first match wins.
  let grade: Grade;
  let reason: string;

  if (g.grade === 'ESCALATE') {
    grade = 'ESCALATE';
    reason = g.grade_reason || 'Existing client with a complaint — not a lead.';
  } else if (g.grade === 'NOT_ENQUIRY') {
    grade = 'NOT_ENQUIRY';
    reason = g.grade_reason || 'Not a project enquiry.';
  } else if (c1 === 'fail' || c2 === 'fail' || c3 === 'fail' || c4 === 'fail') {
    grade = 'LOW';
    reason = lowReason(criteria, fit, est.est_min_inr, f);
  } else if (c1 === 'pass' && c2 === 'pass' && c3 === 'pass' && c4 === 'pass') {
    grade = 'HOT';
    const budgetBit =
      fit === 'fits'
        ? 'budget covers the internal estimate'
        : clearsFloor
          ? `budget clears the ₹${((r.hotBudgetFloorInr ?? 0) / 100000).toFixed(0)}L floor`
          : 'budget works';
    reason = `In ${f.locality ?? 'the service area'}, in scope, ${budgetBit}, and the timeline works.`;
  } else {
    grade = 'WARM';
    reason = warmReason(criteria, fit);
  }

  // rubric.md §12 — low confidence never lands below WARM.
  if (g.confidence < 0.6 && grade === 'LOW') {
    grade = 'WARM';
    reason = `Held at Warm: the call was unclear (confidence ${g.confidence.toFixed(2)}), so a designer should check rather than drop it.`;
    flags.add('LOW_CONFIDENCE');
  }

  // rubric.md §10 — booking eligibility.
  const booking_eligible =
    c1 !== 'fail' &&
    c2 === 'pass' &&
    (!!f.carpet_area_sqft || f.scope === 'single_room') &&
    grade !== 'ESCALATE' &&
    grade !== 'NOT_ENQUIRY';

  return {
    grade,
    grade_reason: reason,
    criteria,
    flags: [...flags].sort(),
    est_min_inr: est.est_min_inr,
    est_max_inr: est.est_max_inr,
    estimate_basis: est.basis,
    budget_fit: fit,
    disagreed_with_gemini: g.grade !== grade,
    gemini_grade: g.grade,
    booking_eligible,
  };
}

function normaliseFlag(f: string) {
  return f.trim().toUpperCase().replace(/\s+/g, '_');
}

function budgetReason(fit: BudgetFit, estMin: number | null, f: LeadFields, clearsFloor = false, floor: number | null = null) {
  const b = f.budget_inr_max ?? f.budget_inr_min;
  if (clearsFloor && fit !== 'fits') {
    const lakh = floor ? `₹${(floor / 100000).toFixed(0)}L` : 'the floor';
    const gap = fit === 'below' ? 'below' : 'close to';
    return `Stated budget clears the ${lakh} floor, so it passes — though it is still ${gap} the internal estimate.`;
  }
  if (fit === 'unknown') {
    if (!b) return 'No budget stated — never counted against the caller.';
    return 'No usable area for an estimate, so budget fit cannot be judged.';
  }
  const pct = estMin && b ? Math.round((b / estMin) * 100) : null;
  if (fit === 'fits') return `Stated budget covers the internal minimum${pct ? ` (${pct}% of it)` : ''}.`;
  if (fit === 'close') return `Stated budget is within 20% of the internal minimum${pct ? ` (${pct}%)` : ''}.`;
  return `Stated budget is more than 20% below the internal minimum${pct ? ` (${pct}%)` : ''}.`;
}

function reasonFor(id: string, result: string, f: LeadFields, g: GeminiOutput) {
  if (id === 'C1') {
    if (result === 'pass') return `${f.locality} is in the service area.`;
    if (result === 'fail') return `${f.locality} is outside Pune and PCMC.`;
    return f.locality ? `${f.locality} is not on the served list — treat case by case.` : 'Locality not stated.';
  }
  if (id === 'C2') return result === 'unclear' ? 'Scope not stated.' : g.criteria.C2.reason;
  if (id === 'C4') return f.timeline_months == null ? 'No completion date given.' : `Wants it done in about ${f.timeline_months} month(s).`;
  return '';
}

function lowReason(c: Criteria, fit: BudgetFit, estMin: number | null, f: LeadFields) {
  if (c.C1.result === 'fail') return `Outside the service area — ${f.locality}.`;
  if (c.C2.result === 'fail') return c.C2.reason || 'Not something Aangan takes on.';
  if (c.C3.result === 'fail') return c.C3.reason;
  return c.C4.reason || 'Timeline does not work.';
}

function warmReason(c: Criteria, fit: BudgetFit) {
  const bits: string[] = [];
  if (c.C1.result === 'unclear') bits.push('locality needs checking');
  if (c.C2.result === 'unclear') bits.push('scope not pinned down');
  if (fit === 'unknown') bits.push('no budget stated');
  if (fit === 'close') bits.push('budget is close to the internal minimum');
  if (c.C4.result === 'unclear') bits.push('timeline is open');
  if (c.C5.result !== 'pass') bits.push('decision-maker unclear');
  return bits.length
    ? `Worth a designer's call — ${bits.join(', ')}.`
    : "Worth a designer's call.";
}
