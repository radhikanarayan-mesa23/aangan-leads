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
  /** Slots the agent booked live, or preferences collected for the fallback path. */
  booked_at: string | null;
  calcom_booking_uid: string | null;
  preferred_slots: string[];
  /** Vaani's own cost for the call, if the payload carries one. */
  cost_inr: number | null;
  raw: unknown;
};

/** Events Vaani AI fires. `webhook_test` comes from the dashboard Test button. */
export type VaaniEvent =
  | 'call_started'
  | 'call_ringing'
  | 'user_picked_up_at'
  | 'call_rejected'
  | 'call_no_answer'
  | 'call_failed'
  | 'human_transfer_initiated'
  | 'human_transfer_successful'
  | 'human_transfer_failed'
  | 'call_ended'
  | 'call_postprocessing'
  | 'webhook_test';

export type VaaniDelivery = {
  /** The dashboard Test button — acknowledge it, never store it as a lead. */
  isTest: boolean;
  /** Every event in this delivery; one POST can carry several. */
  events: { event: string; call_id?: string; timestamp?: string; data: any }[];
  /**
   * The event worth acting on. `call_postprocessing` carries the transcript,
   * summary and recording, so it wins over `call_ended`, which is only timing.
   */
  primary: { event: string; data: any } | null;
};

/**
 * A delivery looks like:
 *   { event, timestamp, events: [ { event: "call_postprocessing", data: {…} },
 *                                 { event: "call_ended", data: {…} } ] }
 * Older/bare shapes are still accepted so the replay script keeps working.
 */
export function readDelivery(raw: any): VaaniDelivery {
  const isTest = raw?.event === 'webhook_test';
  const list: any[] = Array.isArray(raw?.events) ? raw.events : [];

  const events = list.map((e) => ({
    event: String(e?.event ?? ''),
    call_id: e?.call_id ?? e?.data?.call_id,
    timestamp: e?.timestamp,
    data: e?.data ?? {},
  }));

  if (events.length === 0) {
    // A bare body — the replay script, or a single-event POST.
    const data = raw?.data ?? raw?.call ?? raw ?? {};
    return { isTest, events: [{ event: String(raw?.event ?? 'call_postprocessing'), data }], primary: { event: String(raw?.event ?? 'call_postprocessing'), data } };
  }

  const primary =
    events.find((e) => e.event === 'call_postprocessing') ??
    events.find((e) => e.event === 'call_ended') ??
    events[0];

  return { isTest, events, primary };
}

/** Kept for callers that still speak the old name. */
export const readEnvelope = (raw: any) => {
  const d = readDelivery(raw);
  return { event_id: null as string | null, type: d.primary?.event ?? '', created: null, data: d.primary?.data ?? {}, bare: !Array.isArray(raw?.events) };
};

/**
 * `call_ended` reports seconds, `call_postprocessing` reports milliseconds.
 * Anything implausibly large for a five-minute call is treated as milliseconds
 * whichever event it came from, so a provider change cannot silently inflate
 * every call's cost.
 */
function durationSeconds(value: unknown, event: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const looksLikeMs = n > 3600 || event === 'call_postprocessing';
  return Math.round(looksLikeMs && n > 3600 ? n / 1000 : n);
}

export function normalizeVaniPayload(raw: any): NormalisedCall {
  const delivery = readDelivery(raw);
  const primary = delivery.primary;
  const data = primary?.data ?? {};
  // Timing may arrive on a sibling event rather than the primary one.
  const ended = delivery.events.find((e) => e.event === 'call_ended')?.data ?? {};
  const call = data?.call ?? data ?? {};
  const meta = call?.metadata ?? call?.custom_data ?? raw?.metadata ?? {};

  return {
    vani_call_id:
      str(call.call_id ?? call.room_name ?? primary?.data?.call_id ?? call.id ?? call.callId ?? raw?.call_id) ??
      `unknown-${Date.now()}`,
    caller_number: str(call.from ?? call.from_number ?? call.phone_number ?? call.caller ?? call.customer_number),
    caller_name: str(meta.caller_name ?? call.caller_name ?? call.entities?.customer_name ?? call.customer_name),
    caller_email: str(meta.caller_email ?? call.caller_email),
    started_at: iso(call.started_at ?? call.start_time ?? call.startedAt ?? raw?.started_at),
    duration_s:
      durationSeconds(call.call_duration, primary?.event ?? '') ??
      durationSeconds(ended.call_duration, 'call_ended') ??
      int(call.duration ?? call.duration_seconds ?? call.duration_s),
    ended_reason: str(call.end_reason ?? ended.end_reason ?? call.ended_reason ?? call.status),
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
