import type { TranscriptTurn } from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// The ONLY file that knows Vaani's payload shape (CLAUDE.md §10).
// ASSUME: Vaani's exact call-ended body is unverified. This normaliser accepts
// the common shapes and falls back safely; when the real payload arrives, only
// this file changes.
// ─────────────────────────────────────────────────────────────────────────────

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
  calendly_event_uri: string | null;
  preferred_slots: string[];
  /** Vaani's own cost for the call, if the payload carries one. */
  cost_inr: number | null;
  raw: unknown;
};

export function normalizeVaniPayload(raw: any): NormalisedCall {
  const call = raw?.call ?? raw?.data ?? raw ?? {};
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
    calendly_event_uri: str(meta.calendly_event_uri ?? call.calendly_event_uri),
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
