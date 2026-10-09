import type { TranscriptTurn } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// The ONLY file that knows Vaani's payload shape (CLAUDE.md §10).
//
// Written against VaaniVoice's published OpenAPI 3.1 spec. Every outbound
// delivery is an envelope:
//
//   { id: "evt_…", type: "call.completed", created: <unix>, data: { … } }
//
// signed with `X-VaaniVoice-Signature: sha256=<hex>` over the raw bytes. The
// spec warns that "no sub-field is guaranteed" and that phone numbers are
// masked, so everything below is a defensive parse.
// ─────────────────────────────────────────────────────────────────────────────

/** Event types the spec says a subscription may carry. */
export type VaaniEvent =
  | 'call.completed'
  | 'call.failed'
  | 'meeting.ended'
  | 'lead.created'
  | 'usage.charged'
  | 'low_balance.warned'
  | 'webhook.ping';

export type VaaniEnvelope = {
  event_id: string | null;
  type: VaaniEvent | string;
  created: number | null;
  data: any;
  /** True when the body was NOT an envelope — a bare payload from a test or another vendor. */
  bare: boolean;
};

/**
 * Unwraps the envelope. Falls back to treating the whole body as the payload,
 * so `scripts/replay.ts` and any non-Vaani source still work.
 */
export function readEnvelope(raw: any): VaaniEnvelope {
  const looksLikeEnvelope = raw && typeof raw === 'object' && typeof raw.type === 'string' && 'data' in raw;
  if (!looksLikeEnvelope) {
    return { event_id: null, type: 'call.completed', created: null, data: raw, bare: true };
  }
  return {
    event_id: typeof raw.id === 'string' ? raw.id : null,
    type: raw.type,
    created: Number.isFinite(raw.created) ? Number(raw.created) : null,
    data: raw.data ?? {},
    bare: false,
  };
}

export type NormalisedCall = {
  vani_call_id: string;
  caller_number: string | null;
  caller_name: string | null;
  caller_email: string | null;
  started_at: string | null;
  duration_s: number | null;
  ended_reason: string | null;
  recording_url: string | null;
  transcript: TranscriptTurn[];
  /** Slots the agent booked live, or preferences it collected for the fallback path. */
  booked_at: string | null;
  calcom_booking_uid: string | null;
  preferred_slots: string[];
  /** Vaani's own cost for the call, if the payload carries one. */
  cost_inr: number | null;
  raw: unknown;
};

export function normalizeVaniPayload(raw: any): NormalisedCall {
  // Accept an envelope, a bare body, or a {call:…} wrapper.
  const unwrapped = readEnvelope(raw).data ?? raw ?? {};
  const call = unwrapped?.call ?? unwrapped ?? {};
  const meta = call?.metadata ?? call?.custom_data ?? raw?.metadata ?? {};

  return {
    vani_call_id: str(call.call_id ?? call.id ?? call.callId ?? raw?.call_id ?? raw?.id) ?? `unknown-${Date.now()}`,
    caller_number: str(call.from ?? call.from_number ?? call.caller ?? call.customer_number ?? raw?.from),
    caller_name: str(meta.caller_name ?? call.caller_name ?? call.customer_name),
    caller_email: str(meta.caller_email ?? call.caller_email),
    started_at: iso(call.started_at ?? call.start_time ?? call.startedAt ?? raw?.started_at),
    duration_s: int(call.duration ?? call.duration_seconds ?? call.duration_s ?? raw?.duration),
    ended_reason: str(call.ended_reason ?? call.end_reason ?? call.status ?? call.disconnect_reason),
    recording_url: str(call.recording_url ?? call.recordingUrl ?? call.recording?.url ?? raw?.recording_url),
    transcript: normalizeTranscript(call.transcript ?? call.messages ?? raw?.transcript),
    booked_at: iso(meta.booked_at ?? call.booked_at),
    calcom_booking_uid: str(meta.calcom_booking_uid ?? call.calcom_booking_uid),
    preferred_slots: arr(meta.preferred_slots ?? call.preferred_slots),
    cost_inr: num(call.cost_inr ?? call.cost ?? raw?.cost_inr),
    raw,
  };
}

export function normalizeTranscript(t: any): TranscriptTurn[] {
  if (!t) return [];

  // Already structured: [{speaker,text,t}] or [{role,content}]
  if (Array.isArray(t)) {
    return t
      .map((turn: any) => ({
        speaker: speakerOf(turn.speaker ?? turn.role ?? turn.from),
        text: String(turn.text ?? turn.content ?? turn.message ?? '').trim(),
        t: num(turn.t ?? turn.time ?? turn.timestamp ?? turn.seconds),
      }))
      .filter((turn) => turn.text.length > 0);
  }

  // A plain string: "Agent: …\nCaller: …"
  if (typeof t === 'string') {
    return t
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(agent|assistant|bot|ai|caller|user|customer|human)\s*[:\-]\s*(.*)$/i);
        return m
          ? { speaker: speakerOf(m[1]), text: m[2].trim(), t: null }
          : { speaker: 'caller' as const, text: line, t: null };
      })
      .filter((turn) => turn.text.length > 0);
  }

  return [];
}

function speakerOf(v: any): TranscriptTurn['speaker'] {
  const s = String(v ?? '').toLowerCase();
  if (/agent|assistant|bot|\bai\b|aangan/.test(s)) return 'agent';
  if (/system/.test(s)) return 'system';
  return 'caller';
}

const str = (v: any): string | null => (v == null || v === '' ? null : String(v));
const num = (v: any): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v: any): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : []);
const iso = (v: any): string | null => {
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Counts off-script moments from the agent's own stock line (rubric.md §5). */
export function countOffScript(transcript: TranscriptTurn[]): number {
  return transcript.filter((t) => t.speaker === 'agent' && /can't answer on this call/i.test(t.text)).length;
}
