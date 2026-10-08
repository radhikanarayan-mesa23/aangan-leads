import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { pool } from '../lib/db';
import { normalizeVaniPayload } from '../lib/vaani';
import { processLead, upsertCall } from '../lib/pipeline';
import { SEED_CALLS } from '../seed/calls';

/**
 * Replays a call through the real pipeline — Gemini, the code grader, the
 * callback promise and Telegram — exactly as the webhook would.
 *
 *   npm run replay                     # replays the first seeded transcript
 *   npm run replay -- seed hot-baner   # a named seeded transcript
 *   npm run replay -- payload.json     # a real Vaani payload from disk
 */
async function main() {
  const [a, b] = process.argv.slice(2);
  let payload: unknown;

  if (a === 'seed' || !a) {
    const call = SEED_CALLS.find((c) => c.key === b) ?? SEED_CALLS[0];
    console.log(`Replaying seeded call "${call.key}" (${call.caller_name})\n`);
    payload = {
      call: {
        call_id: `replay-${call.key}-${Date.now()}`,
        from: call.caller_number,
        started_at: new Date().toISOString(),
        duration: call.duration_s,
        ended_reason: call.ended_reason,
        transcript: call.transcript,
        metadata: { caller_name: call.caller_name, caller_email: call.caller_email },
      },
    };
  } else {
    payload = JSON.parse(readFileSync(a, 'utf8'));
    console.log(`Replaying payload from ${a}\n`);
  }

  const normalised = normalizeVaniPayload(payload);
  const lead = await upsertCall(normalised);
  console.log(`→ stored as ${lead.ticket_no} (${lead.id})`);

  await processLead(lead.id);

  const after = await pool().query('select ticket_no, grade, budget_fit, stage, est_min_inr, est_max_inr, grade_reason, cost_inr, step_errors from leads where id = $1', [lead.id]);
  console.log('\nResult:');
  console.table(after.rows);
  const errs = after.rows[0]?.step_errors ?? [];
  if (errs.length) console.log('Steps that failed:', errs);
  console.log(`\nOpen it: http://localhost:3000/board?lead=${lead.id}`);
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
