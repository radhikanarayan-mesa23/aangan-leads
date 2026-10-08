import { env } from './env';

/** Hard rule 8: cost_inr = vaani_cost_inr + llm_cost_inr (cost_inr is a generated column). */
export function vaaniCost(durationS: number | null | undefined, payloadCost?: number | null): number {
  if (payloadCost != null && Number.isFinite(payloadCost) && payloadCost > 0) return round2(payloadCost);
  const mins = (durationS ?? 0) / 60;
  return round2(mins * env.COST_VAANI_INR_PER_MIN);
}

export function llmCost(inputTokens: number, outputTokens: number): number {
  return round2(
    (inputTokens / 1000) * env.COST_GEMINI_INR_PER_1K_INPUT +
      (outputTokens / 1000) * env.COST_GEMINI_INR_PER_1K_OUTPUT
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
