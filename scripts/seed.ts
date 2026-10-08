import 'dotenv/config';
import { pool, sql } from '../lib/db';
import { SEED_CALLS } from '../seed/calls';
import { gradeLead } from '../lib/grading';
import { llmCost, vaaniCost } from '../lib/cost';
import { nextWorkingDays, slotInstant, spokenCallbackPromise } from '../lib/time';
import { GeminiOutputSchema } from '../lib/schema';

function at(daysAgo: number, hourIST: number): Date {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  // hourIST → UTC (IST = UTC+5:30)
  d.setUTCHours(hourIST - 5, 30, 0, 0);
  return d;
}

/** A consultation that already happened: N days after the call, on a slot hour. */
function pastSlot(callAt: Date, daysAfter: number, hourIST: number): Date {
  const d = new Date(callAt.getTime() + daysAfter * 86_400_000);
  d.setUTCHours(hourIST - 5, 30, 0, 0);
  return d;
}

export async function seedAll(log = console.log) {
  log(`Seeding ${SEED_CALLS.length} calls through the real grading code…\n`);
  await sql('delete from lead_events where lead_id in (select id from leads where vani_call_id like $1)', ['seed-%']);
  await sql('delete from leads where vani_call_id like $1', ['seed-%']);

  const workingDays = nextWorkingDays(new Date(), 6);
  let mismatches = 0;

  for (const call of SEED_CALLS) {
    const parsed = GeminiOutputSchema.parse(call.gemini);
    const verdict = gradeLead(parsed);

    const started = at(call.daysAgo, call.hourIST);
    // A positive booked_days_ahead is an upcoming slot on the shared calendar;
    // a negative one is a consultation that already happened, that many days
    // after the call. Both must sit on a slot hour so the calendar lines up and
    // the unique index on booked_at cannot collide.
    const bookedAt =
      call.booked_days_ahead == null
        ? null
        : call.booked_days_ahead >= 0
          ? slotInstant(workingDays[Math.min(call.booked_days_ahead, workingDays.length - 1)], call.booked_hour ?? 14)
          : pastSlot(started, Math.abs(call.booked_days_ahead), call.booked_hour ?? 14);

    const stage = call.stage ?? (bookedAt ? 'Consultation booked' : 'New');
    // Only the callers the agent actually promised a callback to get one.
    const promise = spokenCallbackPromise(call.transcript, started);

    const rows = await sql<{ id: string; ticket_no: string }>(
      `insert into leads (
         vani_call_id, raw_payload, caller_name, caller_number, caller_email,
         started_at, created_at, duration_s, ended_reason, transcript,
         off_script_count, off_script_questions,
         fields, grade, grade_reason, gemini_grade, criteria,
         est_min_inr, est_max_inr, budget_fit, confidence, price_mentioned, flags,
         summary, handoff_note, insights,
         booked_at, callback_due_at, callback_done_at,
         stage, assigned_to, lost_reason, deal_value_inr, stage_changed_at, first_contact_at,
         vaani_cost_inr, llm_cost_inr
       ) values (
         $1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
         $26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
       ) returning id, ticket_no`,
      [
        `seed-${call.key}`,
        JSON.stringify({ seeded: true }),
        call.caller_name,
        call.caller_number,
        call.caller_email,
        started,
        call.duration_s,
        call.ended_reason,
        JSON.stringify(call.transcript),
        parsed.off_script_questions.length,
        parsed.off_script_questions,
        JSON.stringify({ ...parsed.fields, estimate_basis: verdict.estimate_basis }),
        verdict.grade,
        verdict.grade_reason,
        verdict.gemini_grade,
        JSON.stringify(verdict.criteria),
        verdict.est_min_inr,
        verdict.est_max_inr,
        verdict.budget_fit,
        parsed.confidence,
        parsed.price_mentioned,
        verdict.flags,
        parsed.summary,
        parsed.handoff_note,
        JSON.stringify(parsed.insights),
        bookedAt,
        bookedAt ? null : (promise?.dueAt ?? null),
        promise && stage !== 'New' && !bookedAt ? new Date(started.getTime() + 40 * 60_000) : null,
        stage,
        call.assigned_to ?? null,
        call.lost_reason ?? null,
        call.deal_value_inr ?? null,
        new Date(started.getTime() + 3 * 3_600_000),
        stage === 'New' ? null : new Date(started.getTime() + 35 * 60_000),
        vaaniCost(call.duration_s),
        llmCost(3400, 650),
      ]
    );

    const lead = rows[0];
    await sql("insert into lead_events (lead_id, type, note, at) values ($1,'created',$2,$3)", [
      lead.id,
      `Call ${call.key} stored.`,
      started,
    ]);
    await sql("insert into lead_events (lead_id, type, note, at) values ($1,'graded',$2,$3)", [
      lead.id,
      verdict.disagreed_with_gemini
        ? `Graded ${verdict.grade}. Code overrode Gemini's ${verdict.gemini_grade} on the budget maths.`
        : `Graded ${verdict.grade}. ${verdict.grade_reason}`,
      new Date(started.getTime() + 60_000),
    ]);
    if (bookedAt) {
      await sql("insert into lead_events (lead_id, type, note, at) values ($1,'booked',$2,$3)", [
        lead.id,
        'Consultation booked in the call.',
        new Date(started.getTime() + 30_000),
      ]);
    }
    if (stage !== 'New') {
      await sql(
        "insert into lead_events (lead_id, type, from_stage, to_stage, by, at) values ($1,'stage_change','New',$2,$3,$4)",
        [lead.id, stage, call.assigned_to ?? 'sneha@aanganstudio.in', new Date(started.getTime() + 2 * 3_600_000)]
      );
    }

    const ok = call.expect.startsWith(verdict.grade);
    if (!ok) mismatches++;
    log(
      `${ok ? '✓' : '✗'} ${lead.ticket_no}  ${verdict.grade.padEnd(11)} ${call.caller_name.padEnd(18)} ${verdict.budget_fit.padEnd(8)} ${
        verdict.disagreed_with_gemini ? `(code overrode Gemini's ${verdict.gemini_grade})` : ''
      }`
    );
    if (!ok) log(`    expected: ${call.expect}`);
  }

  log(`\n${SEED_CALLS.length} leads seeded. ${mismatches} unexpected grade(s).`);
  return mismatches;
}

// Only talk to a real database when run directly, not when imported by a test.
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  seedAll()
    .then(async (mismatches) => {
      await pool().end();
      if (mismatches) process.exit(1);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
