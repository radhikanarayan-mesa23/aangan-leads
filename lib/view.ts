import { n, type LeadRow } from './leads';
import type { Stage } from './stages';

/** What a card needs. Deliberately small — the detail panel fetches the rest. */
export type BoardLead = {
  id: string;
  ticket_no: string;
  caller_name: string | null;
  grade: string | null;
  stage: Stage;
  created_at: string;
  booked_at: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  budget_fit: string | null;
  locality: string | null;
  property_type: string | null;
  scope: string | null;
  carpet_area_sqft: number | null;
  deal_value_inr: number | null;
  flags: string[];
  // what the card needs to say what to do next
  callback_due_at: string | null;
  callback_done_at: string | null;
  first_contact_at: string | null;
  call_attempts: number;
  last_outcome: string | null;
};

export function toBoardLead(l: LeadRow, names: Record<string, string> = {}): BoardLead {
  return {
    id: l.id,
    ticket_no: l.ticket_no,
    // Fall back to what the transcript gave us, so a card is never nameless
    // when the name was said out loud.
    caller_name: l.caller_name ?? l.fields?.caller_name ?? null,
    grade: l.grade,
    stage: l.stage,
    created_at: l.created_at,
    booked_at: l.booked_at,
    assigned_to: l.assigned_to,
    assigned_name: l.assigned_to ? names[l.assigned_to] ?? null : null,
    budget_fit: l.budget_fit,
    locality: l.fields?.locality ?? null,
    property_type: l.fields?.property_type ?? null,
    scope: l.fields?.scope ?? null,
    carpet_area_sqft: l.fields?.carpet_area_sqft ?? null,
    deal_value_inr: n(l.deal_value_inr),
    flags: l.flags ?? [],
    callback_due_at: l.callback_due_at,
    callback_done_at: l.callback_done_at,
    first_contact_at: l.first_contact_at,
    call_attempts: (l as any).call_attempts ?? 0,
    last_outcome: (l as any).last_outcome ?? null,
  };
}

/** The detail panel's payload. The internal estimate is included and labelled. */
export type LeadDetailData = {
  lead: LeadRow;
  events: { id: string; at: string; by: string | null; type: string; from_stage: string | null; to_stage: string | null; note: string | null }[];
  has_recording: boolean;
};
