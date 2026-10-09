import { env, has } from './env';
import { rubricText } from './rubric';
import { GeminiOutputSchema, type GeminiOutput, type TranscriptTurn } from './schema';

export type GeminiResult = {
  output: GeminiOutput;
  input_tokens: number;
  output_tokens: number;
  attempts: number;
  raw: string;
};

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/**
 * One call per lead (hard rule, CLAUDE.md §7): temperature 0, JSON response,
 * Zod-validated, retried once with the validation error fed back.
 * The system prompt IS rubric.md — criteria are never restated here.
 */
export async function gradeWithGemini(opts: {
  transcript: TranscriptTurn[];
  callerNumber?: string | null;
  durationS?: number | null;
}): Promise<GeminiResult> {
  if (!has.gemini()) throw new Error('GEMINI_API_KEY is not set');

  const system = [
    rubricText(),
    '',
    '---',
    '',
    'You are the grader described in section 12 above. Read the call transcript and return ONLY the JSON object from section 12 — no markdown fence, no commentary.',
    'Judge strictly from the transcript and this rubric. Never guess a value the caller did not say; use null.',
    'Never put a price, rate or estimate into summary, handoff_note or insights.',
  ].join('\n');

  const transcriptText = opts.transcript
    .map((t) => `${t.speaker === 'agent' ? 'AGENT' : t.speaker === 'caller' ? 'CALLER' : 'SYSTEM'}: ${t.text}`)
    .join('\n');

  const baseUser = [
    `Caller number: ${opts.callerNumber ?? 'unknown'}`,
    `Call duration: ${opts.durationS ?? 'unknown'} seconds`,
    '',
    'TRANSCRIPT:',
    transcriptText || '(empty — silent call)',
  ].join('\n');

  let lastErr = '';
  let input_tokens = 0;
  let output_tokens = 0;
  let raw = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = attempt === 1 ? baseUser : `${baseUser}\n\nYour previous reply failed validation:\n${lastErr}\nReturn corrected JSON only.`;
    const res = await fetch(`${ENDPOINT(env.GEMINI_MODEL)}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          // Gemini 3.x reasons before answering, and that reasoning is billed
          // against this budget. At 4096 the JSON was being cut off mid-object
          // and failing validation, so give it room.
          maxOutputTokens: 16384,
          // On the retry, stop it reasoning entirely. The rubric is explicit and
          // the code re-derives every number anyway, so a plain extraction is
          // the more reliable second attempt.
          ...(attempt === 2 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });

    if (!res.ok) {
      lastErr = `Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`;
      if (attempt === 2) throw new Error(lastErr);
      continue;
    }

    const body = (await res.json()) as any;
    input_tokens += body?.usageMetadata?.promptTokenCount ?? 0;
    // Reasoning tokens are billed too, so count them or the cost per lead lies.
    output_tokens += (body?.usageMetadata?.candidatesTokenCount ?? 0) + (body?.usageMetadata?.thoughtsTokenCount ?? 0);

    const candidate = body?.candidates?.[0];
    raw = candidate?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';

    if (!raw && candidate?.finishReason) {
      lastErr = `Gemini returned no text (finishReason: ${candidate.finishReason})`;
      if (attempt === 2) throw new Error(lastErr);
      continue;
    }

    const parsed = GeminiOutputSchema.safeParse(safeJson(raw));
    if (parsed.success) {
      return { output: parsed.data, input_tokens, output_tokens, attempts: attempt, raw };
    }
    lastErr = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 600);
    if (attempt === 2) throw new Error(`Gemini output failed validation twice — ${lastErr}`);
  }

  throw new Error('unreachable');
}

function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}
