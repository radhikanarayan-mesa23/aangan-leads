import { z } from 'zod';

export const GRADES = ['HOT', 'WARM', 'LOW', 'ESCALATE', 'NOT_ENQUIRY'] as const;
export type Grade = (typeof GRADES)[number];

const nullableString = z.string().nullable().catch(null);
const nullableNumber = z.number().nullable().catch(null);

export const CriterionSchema = z.object({
  result: z.enum(['pass', 'fail', 'unclear']).catch('unclear'),
  reason: z.string().default(''),
});

export const FieldsSchema = z.object({
  caller_name: nullableString,
  caller_email: nullableString,
  property_type: nullableString,
  carpet_area_sqft: nullableNumber,
  locality: nullableString,
  scope: z.enum(['full_home', 'partial', 'single_room', 'painting', 'office', 'other']).nullable().catch(null),
  rooms: z.array(z.string()).default([]),
  current_state: z.enum(['new', 'lived_in', 'renovation']).nullable().catch(null),
  ownership: z.enum(['owned', 'rented']).nullable().catch(null),
  style: nullableString,
  budget_volunteered: z.boolean().catch(false),
  budget_inr_min: nullableNumber,
  budget_inr_max: nullableNumber,
  completion_needed_by: nullableString,
  timeline_months: nullableNumber,
  decision_maker: nullableString,
  source: z.enum(['referral', 'instagram', 'google', 'walk_in', 'other']).nullable().catch(null),
  /** Area of the rooms being done, when a partial job gave one. */
  partial_area_sqft: nullableNumber.optional(),
});

export const InsightsSchema = z.object({
  intent: z.enum(['hot', 'warm', 'cold']).catch('warm'),
  concerns: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  sentiment: z.enum(['positive', 'neutral', 'negative']).catch('neutral'),
  suggested_opener: z.string().default(''),
});

export const GeminiOutputSchema = z.object({
  fields: FieldsSchema,
  criteria: z.object({
    C1: CriterionSchema,
    C2: CriterionSchema,
    C3: CriterionSchema,
    C4: CriterionSchema,
    C5: CriterionSchema,
  }),
  grade: z.enum(GRADES),
  grade_reason: z.string().default(''),
  flags: z.array(z.string()).default([]),
  summary: z.string().default(''),
  handoff_note: z.string().default(''),
  insights: InsightsSchema,
  off_script_questions: z.array(z.string()).default([]),
  price_mentioned: z.boolean().catch(false),
  confidence: z.number().min(0).max(1).catch(0.5),
});

export type GeminiOutput = z.infer<typeof GeminiOutputSchema>;
export type LeadFields = z.infer<typeof FieldsSchema>;
export type Criteria = GeminiOutput['criteria'];

export const TranscriptTurnSchema = z.object({
  speaker: z.enum(['agent', 'caller', 'system']).catch('caller'),
  text: z.string(),
  t: z.number().nullable().catch(null),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
