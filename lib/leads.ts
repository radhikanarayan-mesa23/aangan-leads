import { sql, one } from './db';
import type { Stage } from './stages';

export type LeadRow = {
  id: string;
  ticket_no: string;
  vani_call_id: string;
  created_at: string;
  caller_name: string | null;
  caller_number: string | null;
  caller_email: string | null;
  started_at: string | null;
  duration_s: number | null;
  ended_reason: string | null;
  recording_path: string | null;
  recording_source_url: string | null;
  transcript: { speaker: string; text: string; t: number | null }[];
  off_script_count: number;
  off_script_questions: string[];
  fields: Record<string, any>;
  grade: string | null;
  grade_reason: string | null;
  gemini_grade: string | null;
  criteria: Record<string, { result: string; reason: string }>;
  est_min_inr: string | number | null;
  est_max_inr: string | number | null;
  budget_fit: string | null;
  confidence: string | number | null;
  price_mentioned: boolean;
  flags: string[];
  summary: string | null;
  handoff_note: string | null;
  insights: Record<string, any>;
  calcom_booking_uid: string | null;
  booked_at: string | null;
  callback_due_at: string | null;
  callback_done_at: string | null;
  stage: Stage;
  assigned_to: string | null;
  lost_reason: string | null;
  deal_value_inr: string | number | null;
  stage_changed_at: string;
  first_contact_at: string | null;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  hubspot_sync_error: string | null;
  telegram_sent_at: string | null;
  telegram_queued_for: string | null;
  step_errors: { step: string; error: string; at: string }[];
  call_attempts: number;
  last_attempt_at: string | null;
  last_outcome: string | null;
  vaani_cost_inr: string | number;
  llm_cost_inr: string | number;
  cost_inr: string | number;
};

export const n = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number(v);

export async function listLeads(opts: { limit?: number } = {}): Promise<LeadRow[]> {
  return sql<LeadRow>(
    `select * from leads
     where grade is distinct from 'NOT_ENQUIRY'
     order by created_at desc
     limit $1`,
    [opts.limit ?? 500]
  );
}

export async function getLead(id: string): Promise<LeadRow | null> {
  return one<LeadRow>('select * from leads where id = $1', [id]);
}

export async function listUsers() {
  return sql<{ email: string; name: string; role: string; telegram_chat_id: string | null }>(
    'select email, name, role, telegram_chat_id from users where active order by role, name'
  );
}

export async function listEvents(leadId: string) {
  return sql<{ id: string; at: string; by: string | null; type: string; from_stage: string | null; to_stage: string | null; note: string | null }>(
    'select id, at, by, type, from_stage, to_stage, note from lead_events where lead_id = $1 order by at desc',
    [leadId]
  );
}

export async function logEvent(e: {
  lead_id: string;
  by?: string | null;
  type: string;
  from_stage?: string | null;
  to_stage?: string | null;
  note?: string | null;
}) {
  await sql(
    'insert into lead_events (lead_id, by, type, from_stage, to_stage, note) values ($1,$2,$3,$4,$5,$6)',
    [e.lead_id, e.by ?? null, e.type, e.from_stage ?? null, e.to_stage ?? null, e.note ?? null]
  );
}

/** Hard rule 6: every post-call step records its own failure instead of throwing away the lead. */
export async function logStepError(leadId: string, step: string, error: unknown) {
  const entry = { step, error: String(error).slice(0, 500), at: new Date().toISOString() };
  await sql('update leads set step_errors = step_errors || $2::jsonb where id = $1', [leadId, JSON.stringify([entry])]);
  await logEvent({ lead_id: leadId, type: 'error', note: `${step}: ${entry.error}` }).catch(() => undefined);
}

export async function takenSlots(): Promise<string[]> {
  const rows = await sql<{ booked_at: string }>(
    "select booked_at from leads where booked_at is not null and booked_at > now() - interval '1 day'"
  );
  return rows.map((r) => r.booked_at);
}
