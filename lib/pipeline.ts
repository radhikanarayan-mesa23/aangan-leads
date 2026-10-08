import { sql, one } from './db';
import { gradeWithGemini } from './gemini';
import { gradeLead } from './grading';
import { llmCost, vaaniCost } from './cost';
import { callbackPromise, spokenCallbackPromise } from './time';
import { copyRecording } from './storage';
import { isQuietHours, leadMessage, sendTelegram } from './telegram';
import { logEvent, logStepError, type LeadRow } from './leads';
import { countOffScript, type NormalisedCall } from './vaani';
import { env, has } from './env';
import { TranscriptTurnSchema } from './schema';
import { z } from 'zod';

/**
 * Idempotent on vani_call_id (hard rule 7). Returns the row, created or found.
 */
export async function upsertCall(call: NormalisedCall): Promise<LeadRow> {
  const transcript = z.array(TranscriptTurnSchema).catch([]).parse(call.transcript);
  const row = await one<LeadRow>(
    `insert into leads (
       vani_call_id, raw_payload, caller_name, caller_number, caller_email,
       started_at, duration_s, ended_reason, recording_source_url, transcript,
       off_script_count, booked_at, calcom_booking_id, vaani_cost_inr
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (vani_call_id) do update set
       raw_payload = excluded.raw_payload,
       transcript = case when jsonb_array_length(excluded.transcript) > 0 then excluded.transcript else leads.transcript end,
       duration_s = coalesce(excluded.duration_s, leads.duration_s),
       ended_reason = coalesce(excluded.ended_reason, leads.ended_reason),
       recording_source_url = coalesce(excluded.recording_source_url, leads.recording_source_url),
       -- /tools/book may have created this row mid-call with only a name and a
       -- slot. Fill the gaps from the webhook, but never blank out what is set.
       caller_name = coalesce(leads.caller_name, excluded.caller_name),
       caller_number = coalesce(leads.caller_number, excluded.caller_number),
       caller_email = coalesce(leads.caller_email, excluded.caller_email),
       started_at = coalesce(leads.started_at, excluded.started_at),
       booked_at = coalesce(leads.booked_at, excluded.booked_at),
       calcom_booking_id = coalesce(leads.calcom_booking_id, excluded.calcom_booking_id),
       off_script_count = greatest(leads.off_script_count, excluded.off_script_count),
       vaani_cost_inr = greatest(leads.vaani_cost_inr, excluded.vaani_cost_inr)
     returning *`,
    [
      call.vani_call_id,
      JSON.stringify(call.raw ?? {}),
      call.caller_name,
      call.caller_number,
      call.caller_email,
      call.started_at ?? new Date().toISOString(),
      call.duration_s,
      call.ended_reason,
      call.recording_url,
      JSON.stringify(transcript),
      countOffScript(transcript),
      call.booked_at,
      call.calcom_booking_id,
      vaaniCost(call.duration_s, call.cost_inr),
    ]
  );
  if (!row) throw new Error('upsert returned no row');
  return row;
}

/**
 * Everything after the 200. Each step is isolated (hard rule 6) — a Telegram
 * outage must never cost us the grade.
 */
export async function processLead(leadId: string): Promise<void> {
  const lead = await one<LeadRow>('select * from leads where id = $1', [leadId]);
  if (!lead) return;

  // ── 1. recording (private copy)
  if (lead.recording_source_url && !lead.recording_path) {
    try {
      const path = await copyRecording(lead.recording_source_url, lead.ticket_no);
      if (path) await sql('update leads set recording_path = $2 where id = $1', [leadId, path]);
    } catch (e) {
      await logStepError(leadId, 'recording', e);
    }
  }

  // ── 2. Gemini + code grading
  let graded = false;
  try {
    if (!has.gemini()) throw new Error('GEMINI_API_KEY is not set — lead stored ungraded');
    const g = await gradeWithGemini({
      transcript: lead.transcript as any,
      callerNumber: lead.caller_number,
      durationS: lead.duration_s,
    });
    const verdict = gradeLead(g.output);

    // REPEAT is a code-only flag: has this number called before?
    const prior = await one<{ c: string }>(
      'select count(*)::text as c from leads where caller_number = $1 and id <> $2 and caller_number is not null',
      [lead.caller_number, leadId]
    );
    const flags = Number(prior?.c ?? 0) > 0 ? [...new Set([...verdict.flags, 'REPEAT'])] : verdict.flags;

    const stage = lead.booked_at ? 'Consultation booked' : 'New';

    await sql(
      `update leads set
         fields = $2, grade = $3, grade_reason = $4, gemini_grade = $5, criteria = $6,
         est_min_inr = $7, est_max_inr = $8, budget_fit = $9, confidence = $10,
         price_mentioned = $11, flags = $12, summary = $13, handoff_note = $14,
         insights = $15, off_script_questions = $16, off_script_count = greatest(off_script_count, $17),
         llm_cost_inr = $18, stage = $19, stage_changed_at = now()
       where id = $1`,
      [
        leadId,
        JSON.stringify({ ...g.output.fields, estimate_basis: verdict.estimate_basis }),
        verdict.grade,
        verdict.grade_reason,
        verdict.gemini_grade,
        JSON.stringify(verdict.criteria),
        verdict.est_min_inr,
        verdict.est_max_inr,
        verdict.budget_fit,
        g.output.confidence,
        g.output.price_mentioned,
        flags,
        g.output.summary,
        g.output.handoff_note,
        JSON.stringify(g.output.insights),
        g.output.off_script_questions,
        g.output.off_script_questions.length,
        llmCost(g.input_tokens, g.output_tokens),
        stage,
      ]
    );

    await logEvent({
      lead_id: leadId,
      type: 'graded',
      note: verdict.disagreed_with_gemini
        ? `Graded ${verdict.grade}. Code overrode Gemini's ${verdict.gemini_grade} on the budget maths.`
        : `Graded ${verdict.grade}. ${verdict.grade_reason}`,
    });
    if (lead.booked_at) {
      await logEvent({ lead_id: leadId, type: 'booked', note: `Consultation booked in the call for ${lead.booked_at}.` });
    }
    graded = true;
  } catch (e) {
    await logStepError(leadId, 'gemini', e);
    await sql("update leads set grade = coalesce(grade, 'WARM'), grade_reason = coalesce(grade_reason, $2) where id = $1", [
      leadId,
      'Not graded automatically — a designer should listen to the call.',
    ]);
  }

  // ── 3. callback promise, stored exactly as spoken (hard rule 3)
  try {
    const fresh = await one<LeadRow>('select * from leads where id = $1', [leadId]);
    if (fresh && !fresh.booked_at && fresh.grade !== 'NOT_ENQUIRY') {
      const callAt = new Date(fresh.started_at ?? fresh.created_at);
      // What the agent actually said wins. Only fall back to the time-of-day
      // rule when the lead was eligible for a callback and the transcript is
      // missing or unreadable — never for a caller who was declined.
      const declined = ['OUT_OF_AREA', 'OUT_OF_SCOPE', 'ADVICE_ONLY'].some((f) => fresh.flags?.includes(f));
      const promise =
        spokenCallbackPromise(fresh.transcript as { speaker: string; text: string }[], callAt) ??
        (declined || fresh.transcript?.length ? null : callbackPromise(callAt));

      if (promise) {
        await sql('update leads set callback_due_at = $2 where id = $1 and callback_due_at is null', [leadId, promise.dueAt]);
        await logEvent({ lead_id: leadId, type: 'callback', note: promise.spoken });
      }
    }
  } catch (e) {
    await logStepError(leadId, 'callback', e);
  }

  // ── 4. Telegram
  try {
    await notifyLead(leadId);
  } catch (e) {
    await logStepError(leadId, 'telegram', e);
  }

  if (!graded) return;
}

/** CLAUDE.md §10 — HOT/WARM to designers, ESCALATE to the owner at any hour, LOW to the digest. */
export async function notifyLead(leadId: string): Promise<'sent' | 'queued' | 'skipped'> {
  const lead = await one<LeadRow>('select * from leads where id = $1', [leadId]);
  if (!lead || lead.telegram_sent_at) return 'skipped';
  if (!lead.grade || lead.grade === 'LOW' || lead.grade === 'NOT_ENQUIRY') return 'skipped';
  if (!has.telegram()) return 'skipped';

  const owner = lead.grade === 'ESCALATE';
  const chat = owner ? env.TELEGRAM_OWNER_CHAT_ID : env.TELEGRAM_DESIGNER_CHAT_ID;
  if (!chat) return 'skipped';

  // Designer pushes are held between 9pm and 9am. The owner's urgent alert is not.
  if (!owner && isQuietHours()) {
    const nine = new Date();
    nine.setUTCHours(3, 30, 0, 0); // 09:00 IST
    if (nine.getTime() < Date.now()) nine.setUTCDate(nine.getUTCDate() + 1);
    await sql('update leads set telegram_queued_for = $2 where id = $1', [leadId, nine]);
    return 'queued';
  }

  await sendTelegram(
    chat,
    leadMessage({
      id: lead.id,
      ticket_no: lead.ticket_no,
      grade: lead.grade,
      caller_name: lead.caller_name,
      locality: lead.fields?.locality ?? null,
      property_type: lead.fields?.property_type ?? null,
      scope: lead.fields?.scope ?? null,
      booked_at: lead.booked_at,
    })
  );
  await sql('update leads set telegram_sent_at = now(), telegram_queued_for = null where id = $1', [leadId]);
  await logEvent({ lead_id: leadId, type: 'telegram', note: `Pushed to ${owner ? 'Nikhil (urgent)' : 'the designer chat'}.` });
  return 'sent';
}
