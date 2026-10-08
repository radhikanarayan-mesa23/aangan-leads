/** CLAUDE.md §9 — board columns are the funnel, in order. */
export const STAGES = [
  'New',
  'Contacted',
  'Consultation booked',
  'Site visit',
  'Proposal sent',
  'Converted',
  'Completed',
  'Not converted',
] as const;

export type Stage = (typeof STAGES)[number];

export const OPEN_STAGES: Stage[] = ['New', 'Contacted', 'Consultation booked', 'Site visit', 'Proposal sent'];
export const WON_STAGES: Stage[] = ['Converted', 'Completed'];

/** HubSpot deal stage labels. IDs come from scripts/hubspot-setup.ts into env. */
export const HUBSPOT_STAGE_LABEL: Record<Stage, string | null> = {
  New: null, // no deal yet — created on the first move out of New
  Contacted: 'In progress: Contacted',
  'Consultation booked': 'In progress: Consultation',
  'Site visit': 'In progress: Site visit',
  'Proposal sent': 'In progress: Proposal',
  Converted: 'Closed won',
  Completed: 'Completed',
  'Not converted': 'Closed lost',
};

export const isStage = (s: string): s is Stage => (STAGES as readonly string[]).includes(s);

/** Rules the stage API enforces (CLAUDE.md §9). */
export function validateStageMove(to: Stage, body: { lost_reason?: string | null; deal_value_inr?: number | null }) {
  if (to === 'Not converted' && !body.lost_reason?.trim()) {
    return 'A reason is required before a lead can be marked Not converted.';
  }
  if (to === 'Proposal sent' && !body.deal_value_inr) {
    return 'Enter the proposal value before moving to Proposal sent.';
  }
  return null;
}

export const GRADE_ORDER: Record<string, number> = { HOT: 0, WARM: 1, LOW: 2, ESCALATE: -1, NOT_ENQUIRY: 3 };
