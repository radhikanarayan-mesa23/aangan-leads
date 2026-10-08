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
};

export function toBoardLead(l: LeadRow, names: Record<string, string> = {}): BoardLead {
  return {
    id: l.id,
    ticket_no: l.ticket_no,
    caller_name: l.caller_name,
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
  };
}

/** The detail panel's payload. The internal estimate is included and labelled. */
export type LeadDetailData = {
  lead: LeadRow;
  events: { id: string; at: string; by: string | null; type: string; from_stage: string | null; to_stage: string | null; note: string | null }[];
  has_recording: boolean;
};
