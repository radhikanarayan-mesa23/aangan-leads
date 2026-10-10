import 'dotenv/config';
import { pool, one } from '../lib/db';

/** What the pipeline made of a call. `npm run show-call -- <vani_call_id>` */
async function main() {
  const id = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const lead = id
    ? await one<any>('select * from leads where vani_call_id = $1', [id])
    : await one<any>('select * from leads order by created_at desc limit 1');

  if (!lead) {
    console.log('No such call.');
    return;
  }

  const f = lead.fields ?? {};
  console.log(`\n${lead.ticket_no}  ${lead.caller_name ?? '—'}  ${lead.caller_number ?? ''}`);
  console.log(`  grade      ${lead.grade}  (${lead.budget_fit})`);
  console.log(`  reason     ${lead.grade_reason}`);
  console.log(`  extracted  ${JSON.stringify({ locality: f.locality, type: f.property_type, area: f.carpet_area_sqft, scope: f.scope, budget: f.budget_inr_max, months: f.timeline_months })}`);
  console.log(`  languages  ${(f.languages ?? []).join(', ') || '—'}${f.language_switched ? '  (switched mid-call)' : ''}`);
  console.log(`  flags      ${(lead.flags ?? []).join(', ') || '—'}`);
  console.log(`  stage      ${lead.stage}   duration ${lead.duration_s}s   cost ₹${lead.cost_inr}`);
  console.log(`  transcript ${(lead.transcript ?? []).length} turns`);
  console.log(`  callback   ${lead.callback_due_at ?? 'none promised'}`);
  console.log(`  telegram   ${lead.telegram_sent_at ? 'sent' : lead.telegram_queued_for ? 'queued for ' + lead.telegram_queued_for : 'not sent'}`);
  const errs = lead.step_errors ?? [];
  console.log(`  errors     ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`\n  ${process.env.APP_URL}/board?lead=${lead.id}\n`);
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
