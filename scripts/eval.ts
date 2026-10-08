import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeWithGemini } from '../lib/gemini';
import { gradeLead } from '../lib/grading';
import { SEED_CALLS } from '../seed/calls';
import type { TranscriptTurn } from '../lib/schema';

type Case = { key: string; expect: string[]; transcript: TranscriptTurn[]; must_not_speak_price?: boolean };

/**
 * rubric.md §15 — the build fails on a false LOW (a lead we expected HOT or
 * WARM that came back LOW) or on any call where the agent spoke a price.
 * Run after every change to rubric.md.
 */
async function main() {
  const extra = JSON.parse(readFileSync(join(process.cwd(), 'seed/test-set.json'), 'utf8')) as { cases: Case[] };

  const cases: Case[] = [
    ...SEED_CALLS.map((c) => ({
      key: c.key,
      expect: [c.expect.split(' ')[0]],
      transcript: c.transcript as TranscriptTurn[],
    })),
    ...extra.cases,
  ];

  console.log(`Running ${cases.length} cases through ${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'} + the code grader.\n`);

  let falseLows = 0;
  let pricesSpoken = 0;
  let mismatches = 0;

  for (const c of cases) {
    let line: string;
    try {
      const g = await gradeWithGemini({ transcript: c.transcript, durationS: null });
      const v = gradeLead(g.output);
      const ok = c.expect.includes(v.grade);
      const falseLow = v.grade === 'LOW' && c.expect.some((e) => e === 'HOT' || e === 'WARM');
      if (falseLow) falseLows++;
      if (g.output.price_mentioned) pricesSpoken++;
      if (!ok) mismatches++;

      line = `${ok ? '✓' : '✗'} ${c.key.padEnd(30)} expected ${c.expect.join('/').padEnd(12)} got ${v.grade.padEnd(11)} fit=${v.budget_fit.padEnd(8)} conf=${g.output.confidence.toFixed(2)}`;
      if (!ok) line += `\n    why: ${v.grade_reason}`;
      if (falseLow) line += '\n    ⚠️  FALSE LOW — this would have lost a real project.';
      if (g.output.price_mentioned) line += '\n    ⚠️  THE AGENT SPOKE A PRICE.';
    } catch (e) {
      mismatches++;
      line = `✗ ${c.key.padEnd(30)} errored: ${String(e).slice(0, 160)}`;
    }
    console.log(line);
  }

  console.log(`\n${cases.length - mismatches}/${cases.length} as expected · ${falseLows} false low · ${pricesSpoken} price(s) spoken`);

  if (falseLows > 0 || pricesSpoken > 0) {
    console.error('\nFAILED: a false LOW or a spoken price is a hard stop (rubric.md §15).');
    process.exit(1);
  }
  if (mismatches > 0) {
    console.warn('\nSome grades differed from expectation but none were false lows. Review before shipping.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
