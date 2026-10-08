import 'dotenv/config';
import { SEED_CALLS } from '../seed/calls';
import { gradeLead } from '../lib/grading';
import { GeminiOutputSchema } from '../lib/schema';
import { rubric } from '../lib/rubric';
import { inr } from '../lib/pricing';

/**
 * Runs the grading ladder over every seeded call with no database and no API
 * key. This is the fast check that rubric.md still produces the grades the
 * worked examples promise.
 *
 *   npm run check
 */
const r = rubric();
console.log('rubric.md parsed:');
console.log(`  served localities : ${r.servedLocalities.length} (${r.servedLocalities.slice(0, 4).join(', ')}…)`);
console.log(`  not served        : ${r.notServed.join(', ')}`);
console.log(`  scope offered     : ${Object.entries(r.scopeOffered).map(([k, v]) => `${k}=${v ? 'yes' : 'no'}`).join('  ')}`);
console.log(`  min lead time     : ${r.minLeadTimeWeeks} weeks`);
console.log(`  large job         : ≥ ${r.largeSqft} sq ft`);
console.log(`  slots             : ${r.slotHours.join(', ')} IST, next ${r.slotDaysAhead} working days`);
if (r.warnings.length) {
  console.log('\n  ⚠️  parser warnings:');
  for (const w of r.warnings) console.log(`     ${w}`);
}

console.log(`\nGrading ${SEED_CALLS.length} seeded calls:\n`);
let bad = 0;
for (const call of SEED_CALLS) {
  const v = gradeLead(GeminiOutputSchema.parse(call.gemini));
  const ok = call.expect.startsWith(v.grade);
  if (!ok) bad++;
  console.log(
    `${ok ? '✓' : '✗'} ${call.key.padEnd(26)} ${v.grade.padEnd(11)} ${v.budget_fit.padEnd(8)} est ${String(
      `${inr(v.est_min_inr)}–${inr(v.est_max_inr)}`
    ).padEnd(18)} ${v.disagreed_with_gemini ? `← overrode Gemini's ${v.gemini_grade}` : ''}`
  );
  if (!ok) console.log(`    expected ${call.expect}\n    reason:  ${v.grade_reason}`);
}

const falseLows = SEED_CALLS.filter((c) => {
  const v = gradeLead(GeminiOutputSchema.parse(c.gemini));
  return v.grade === 'LOW' && !c.expect.startsWith('LOW');
}).length;

console.log(`\n${SEED_CALLS.length - bad}/${SEED_CALLS.length} as expected · ${falseLows} false low`);
if (falseLows > 0) {
  console.error('FAILED: a false LOW loses a real project (rubric.md §15).');
  process.exit(1);
}
if (bad > 0) process.exit(1);
