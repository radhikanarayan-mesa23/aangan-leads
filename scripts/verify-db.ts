import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { setExecutor, sql, one } from '../lib/db';
import { seedAll } from './seed';
import { getLead, listEvents, listLeads, listUsers, takenSlots, logEvent } from '../lib/leads';
import { byLocality, bySource, costVsRevenue, funnel, health, heatmap, insights, kpis, leadsOverTime, loadRows, loadStageReach, team } from '../lib/analytics';
import { upsertCall } from '../lib/pipeline';
import { normalizeVaniPayload } from '../lib/vaani';
import { openSlotsFromDb } from '../lib/calcom';
import { SEED_CALLS } from '../seed/calls';

/**
 * Runs the real schema and the real queries against an embedded Postgres, with
 * no server and no network. This is how we find SQL bugs before Neon does.
 *
 *   npm run verify:db
 */
let failures = 0;
const checks: string[] = [];

function ok(name: string, condition: boolean, detail = '') {
  checks.push(`${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

async function expectReject(name: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn();
    ok(name, false, 'expected it to be rejected, but it succeeded');
  } catch (e) {
    ok(name, match.test(String(e)), match.test(String(e)) ? '' : `wrong error: ${String(e).slice(0, 120)}`);
  }
}

async function main() {
  const db = await PGlite.create();
  setExecutor(async (text, params) => (await db.query(text, params as unknown[])).rows as Record<string, unknown>[]);

  // ── schema ────────────────────────────────────────────────────────────────
  // Run the whole chain in order, exactly as scripts/migrate.ts does, so the
  // migrations are tested as a sequence and not just the initial schema.
  const applied: string[] = [];
  for (const file of readdirSync(join(process.cwd(), 'migrations'))
    .filter((f) => f.endsWith('.sql') && !f.includes('rls_supabase'))
    .sort()) {
    await db.exec(readFileSync(join(process.cwd(), 'migrations', file), 'utf8'));
    applied.push(file);
  }
  ok('every migration applies in order', applied.length >= 2, applied.join(' → '));
  const tables = await sql<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public' order by 1"
  );
  ok('migration applies', tables.length >= 4, tables.map((t) => t.table_name).join(', '));

  await sql(
    `insert into users (email, name, role) values
       ('nikhil@aanganstudio.in','Nikhil Deshpande','owner'),
       ('sneha@aanganstudio.in','Sneha Rane','designer'),
       ('arjun@aanganstudio.in','Arjun Mehta','designer')`
  );
  ok('users seed', (await listUsers()).length === 3);

  // ── seed through the real grading code ────────────────────────────────────
  const mismatches = await seedAll(() => {});
  ok('seed inserts every call', mismatches === 0, `${mismatches} grade mismatch(es)`);

  const leads = await listLeads();
  ok('listLeads returns the board', leads.length === SEED_CALLS.length - 1, `${leads.length} rows (NOT_ENQUIRY excluded)`);

  const tickets = await sql<{ ticket_no: string }>('select ticket_no from leads order by ticket_no');
  ok('ticket numbers are sequential AAN-0001…', tickets[0]?.ticket_no === 'AAN-0001' && /^AAN-\d{4}$/.test(tickets.at(-1)!.ticket_no), `${tickets[0]?.ticket_no} … ${tickets.at(-1)?.ticket_no}`);

  const generated = await sql<{ cost_inr: string; vaani_cost_inr: string; llm_cost_inr: string }>(
    'select cost_inr::text, vaani_cost_inr::text, llm_cost_inr::text from leads limit 1'
  );
  const g = generated[0];
  ok(
    'cost_inr is vaani + llm (hard rule 8)',
    Math.abs(Number(g.cost_inr) - (Number(g.vaani_cost_inr) + Number(g.llm_cost_inr))) < 0.01,
    `${g.vaani_cost_inr} + ${g.llm_cost_inr} = ${g.cost_inr}`
  );

  // ── arrays and jsonb round-trip ───────────────────────────────────────────
  const arr = await one<{ flags: string[]; criteria: Record<string, { result: string }>; transcript: unknown[] }>(
    "select flags, criteria, transcript from leads where vani_call_id = 'seed-warm-offscript-price'"
  );
  ok('text[] round-trips', Array.isArray(arr?.flags) && arr!.flags.includes('PRICE-ASKED'), JSON.stringify(arr?.flags));
  ok('jsonb criteria round-trips', arr?.criteria?.C1?.result === 'unclear');
  ok('jsonb transcript round-trips', Array.isArray(arr?.transcript) && arr!.transcript.length > 0);

  // ── detail panel path ─────────────────────────────────────────────────────
  const first = leads[0];
  const detail = await getLead(first.id);
  ok('getLead', !!detail && detail.ticket_no === first.ticket_no);
  ok('listEvents has a timeline', (await listEvents(first.id)).length >= 2);

  // ── hard rule 4: no double booking ────────────────────────────────────────
  const booked = await one<{ booked_at: string }>('select booked_at from leads where booked_at is not null limit 1');
  await expectReject(
    'unique index blocks a double booking',
    () => sql("insert into leads (vani_call_id, booked_at) values ('clash-test', $1)", [booked!.booked_at]),
    /unique|duplicate/i
  );
  const taken = await takenSlots();
  const free = openSlotsFromDb(taken);
  ok('open slots exclude the taken ones', free.every((s) => !taken.some((t) => new Date(t).getTime() === new Date(s.iso).getTime())), `${free.length} free`);

  // ── hard rule 7: idempotent on vani_call_id ───────────────────────────────
  const payload = {
    call: {
      call_id: 'verify-idempotent',
      from: '+919000000001',
      duration: 180,
      ended_reason: 'completed',
      transcript: 'Agent: Namaste.\nCaller: I have a 2BHK in Baner.',
      metadata: { caller_name: 'Idempotency Test' },
    },
  };
  const a = await upsertCall(normalizeVaniPayload(payload));
  const b = await upsertCall(normalizeVaniPayload(payload));
  ok('replayed webhook does not create a second row', a.id === b.id, `${a.ticket_no} / ${b.ticket_no}`);
  const count = await one<{ c: string }>("select count(*)::text c from leads where vani_call_id = 'verify-idempotent'");
  ok('exactly one row for the call id', count?.c === '1');

  // ── the mid-call placeholder, then the webhook ────────────────────────────
  await sql(
    `insert into leads (vani_call_id, caller_name, booked_at, stage, started_at)
     values ('verify-placeholder', 'Booked In Call', $1, 'Consultation booked', now())`,
    [new Date(Date.now() + 86_400_000).toISOString()]
  );
  const merged = await upsertCall(
    normalizeVaniPayload({
      call: {
        call_id: 'verify-placeholder',
        from: '+919000000002',
        duration: 200,
        transcript: [{ speaker: 'caller', text: 'Yes, that time works.' }],
        metadata: { caller_email: 'booked@example.com' },
      },
    })
  );
  ok('webhook fills the placeholder without blanking it', merged.caller_name === 'Booked In Call' && merged.caller_email === 'booked@example.com' && !!merged.booked_at,
    `name=${merged.caller_name} email=${merged.caller_email} booked=${!!merged.booked_at}`);

  // ── stage move, exactly as the route writes it ────────────────────────────
  const mover = leads.find((l) => l.stage === 'New')!;
  await sql(
    `update leads set stage = $2, stage_changed_at = now(), lost_reason = coalesce($3, lost_reason),
       deal_value_inr = coalesce($4, deal_value_inr), assigned_to = coalesce(assigned_to, $5),
       first_contact_at = case when first_contact_at is null and $2 <> 'New' then now() else first_contact_at end
     where id = $1`,
    [mover.id, 'Contacted', null, null, 'sneha@aanganstudio.in']
  );
  await logEvent({ lead_id: mover.id, by: 'sneha@aanganstudio.in', type: 'stage_change', from_stage: 'New', to_stage: 'Contacted' });
  const moved = await getLead(mover.id);
  ok('stage move writes stage, assignee and first contact', moved?.stage === 'Contacted' && moved?.assigned_to === 'sneha@aanganstudio.in' && !!moved?.first_contact_at);

  // ── step_errors append (hard rule 6) ──────────────────────────────────────
  await sql('update leads set step_errors = step_errors || $2::jsonb where id = $1', [
    mover.id,
    JSON.stringify([{ step: 'telegram', error: 'no token', at: new Date().toISOString() }]),
  ]);
  const withErr = await getLead(mover.id);
  ok('step_errors appends', withErr?.step_errors?.length === 1 && withErr.step_errors[0].step === 'telegram');

  // ── owner dashboard: every analytic over real rows ────────────────────────
  const rows = await loadRows();
  const reach = await loadStageReach();
  const k = kpis(rows);
  ok('kpis compute', Number.isFinite(k.pipeline) && Number.isFinite(k.month.cost) && k.month.count > 0,
    `${k.month.count} leads, pipeline ₹${Math.round(k.pipeline / 100000)}L, cost ₹${k.month.cost.toFixed(0)}`);
  const f = funnel(rows, reach);
  ok('funnel is monotonically non-increasing', f.every((d, i) => i === 0 || d.count <= f[i - 1].count), f.map((d) => `${d.stage}:${d.count}`).join(' → '));
  ok('funnel credits the lost lead with how far it got', f[0].count >= f[1].count);
  ok('leadsOverTime', leadsOverTime(rows).length === 30);
  ok('byLocality', byLocality(rows).length > 0, byLocality(rows).slice(0, 3).map((l) => `${l.name}:${l.total}`).join(', '));
  ok('bySource', bySource(rows).length > 0);
  ok('costVsRevenue', costVsRevenue(rows).length === 6 && costVsRevenue(rows).some((m) => m.revenue > 0));
  ok('heatmap', heatmap(rows).length === 7 * 24);
  ok('team table', team(rows, await listUsers()).length === 2);
  const h = health(rows);
  ok('health: no price was ever spoken', h.pricesSpoken === 0, `prices=${h.pricesSpoken} agreement=${h.gradeAgreement}% callbacks=${h.callbacksOnTime}%`);
  ok('health: grade agreement is reported', h.gradeAgreement >= 0 && h.gradeAgreement <= 100);
  const bullets = insights(rows);
  ok('insights produce bullets', bullets.length > 0, `${bullets.length}: ${bullets[0]?.slice(0, 60)}…`);

  // ── hard rule 2: nothing silently dropped ─────────────────────────────────
  const lows = rows.filter((r) => r.grade === 'LOW');
  ok('LOW leads are on the board', lows.length > 0 && lows.every((r) => !!r.stage), `${lows.length} low leads visible`);

  // ── hard rule 3: the callback promise is stored ───────────────────────────
  const promised = await sql<{ c: string }>(
    'select count(*)::text c from leads where callback_due_at is not null and booked_at is null'
  );
  ok('callback promises stored for unbooked leads', Number(promised[0].c) > 0, `${promised[0].c} promises`);

  // ── Cal.com webhook: a slot booked outside the phone agent ───────────────
  const direct = new Date(Date.now() + 3 * 86_400_000);
  direct.setUTCHours(9, 30, 0, 0); // 3pm IST
  const held = await one<{ id: string; ticket_no: string }>(
    `insert into leads (vani_call_id, caller_name, caller_email, booked_at, stage, started_at,
                        calcom_booking_uid, summary, grade, grade_reason)
     values ($1,'Walk-in Booking','direct@example.com',$2,'Consultation booked', now(), $3,
             'Booked directly in Cal.com.', 'WARM', 'No transcript to grade.')
     on conflict (vani_call_id) do nothing
     returning id, ticket_no`,
    ['calcom-direct-test', direct.toISOString(), 'calcom-direct-test-uid']
  );
  ok('a Cal.com-side booking holds the slot', !!held, held?.ticket_no);
  const afterHold = await takenSlots();
  ok('the held slot is no longer offered', !openSlotsFromDb(afterHold).some((s) => new Date(s.iso).getTime() === direct.getTime()));

  await sql(
    `update leads set booked_at = null, calcom_booking_uid = null, calcom_cancel_url = null,
       stage = case when stage = 'Consultation booked' then 'Contacted' else stage end
     where calcom_booking_uid = $1`,
    ['calcom-direct-test-uid']
  );
  const released = await one<{ booked_at: string | null; stage: string }>(
    "select booked_at, stage from leads where vani_call_id = 'calcom-direct-test'"
  );
  ok('a Cal.com cancellation frees the slot but keeps the lead', released?.booked_at === null && released?.stage === 'Contacted',
    `stage=${released?.stage}`);

  // Hard rule 3, the other half: a caller who was declined on the call was
  // promised nothing, so no promise may be stored against them.
  const declined = await sql<{ vani_call_id: string; callback_due_at: string | null }>(
    "select vani_call_id, callback_due_at from leads where vani_call_id in ('seed-low-out-of-area','seed-low-advice-only','seed-low-deadline','seed-not-enquiry-jobseeker')"
  );
  ok('no callback promised to a caller who was declined', declined.length === 4 && declined.every((d) => d.callback_due_at === null),
    declined.map((d) => `${d.vani_call_id.replace('seed-', '')}=${d.callback_due_at ? 'PROMISED' : 'none'}`).join(' '));

  const escalated = await one<{ callback_due_at: string | null; flags: string[] }>(
    "select callback_due_at, flags from leads where vani_call_id = 'seed-escalate-existing-client'"
  );
  ok('the escalation keeps its "right away" promise', !!escalated?.callback_due_at);

  console.log(checks.join('\n'));
  console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
  await db.close();
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.log(checks.join('\n'));
  console.error('\n' + String(e));
  process.exit(1);
});
