import { env, has } from './env';
import { candidateSlots } from './time';

// ─────────────────────────────────────────────────────────────────────────────
// Cal.com API v2.
//
//   GET  /v2/slots      availability        (cal-api-version: 2024-09-04)
//   POST /v2/bookings   create a booking    (cal-api-version: 2024-08-13)
//   POST /v2/bookings/{uid}/cancel
//
// The version header is REQUIRED — omit it and Cal.com returns 404, and a wrong
// value silently falls back to an older shape.
//
// Our own 12/1/2/3/4pm IST grid is what the agent offers; Cal.com is the
// authority on whether a slot is genuinely free. A slot must clear BOTH, and
// the unique index on leads.booked_at is the final guard (hard rule 4).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.cal.com/v2';
const V_SLOTS = '2024-09-04';
const V_BOOKINGS = '2024-08-13';

export type Slot = { iso: string; dateKey: string; hour: number; spoken: string };

async function cal(path: string, version: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.CALCOM_API_KEY}`,
      'cal-api-version': version,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cal.com ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as any) : {};
}

/**
 * Times Cal.com reports as free, as a set of ISO instants.
 * Returns null when Cal.com is not configured or unreachable — callers then
 * fall back to our own database, so an outage never stops a booking.
 */
export async function calcomAvailableSlots(fromIso: string, toIso: string): Promise<Set<string> | null> {
  if (!has.calcom()) return null;
  try {
    const qs = new URLSearchParams({
      eventTypeId: String(env.CALCOM_EVENT_TYPE_ID),
      start: fromIso,
      end: toIso,
      timeZone: 'Asia/Kolkata',
    });
    const body = await cal(`/slots?${qs}`, V_SLOTS);

    // v2 returns { data: { "YYYY-MM-DD": [{ start }, …] } }, and older shapes
    // return a flat array. Accept both rather than depending on one.
    const out = new Set<string>();
    const data = body?.data ?? body;
    if (Array.isArray(data)) {
      for (const s of data) if (s?.start) out.add(new Date(s.start).toISOString());
    } else if (data && typeof data === 'object') {
      for (const day of Object.values<any>(data)) {
        if (!Array.isArray(day)) continue;
        for (const s of day) {
          const t = s?.start ?? s?.time ?? s;
          if (typeof t === 'string') out.add(new Date(t).toISOString());
        }
      }
    }
    return out;
  } catch {
    return null; // degrade to our own calendar rather than refusing to book
  }
}

/**
 * Slots the studio can offer: our grid, minus what we have already booked,
 * intersected with Cal.com's availability when we can reach it.
 */
export async function openSlots(takenIso: string[], from = new Date()): Promise<Slot[]> {
  const ours = openSlotsFromDb(takenIso, from);
  if (ours.length === 0) return [];

  const available = await calcomAvailableSlots(ours[0].iso, ours[ours.length - 1].iso);
  if (!available || available.size === 0) return ours;
  return ours.filter((s) => available.has(new Date(s.iso).toISOString()));
}

/** Our grid minus our own bookings. Used by tests and when Cal.com is bypassed. */
export function openSlotsFromDb(takenIso: string[], from = new Date()): Slot[] {
  const taken = new Set(takenIso.map((t) => new Date(t).toISOString()));
  return candidateSlots(from).filter((s) => !taken.has(new Date(s.iso).toISOString()));
}

export async function calcomBook(opts: {
  startIso: string;
  name: string;
  email: string;
  phone?: string | null;
  ticketNo: string;
  notes?: string;
}): Promise<{ bookingUid: string | null; skipped: boolean; error?: string }> {
  if (!has.calcom()) return { bookingUid: null, skipped: true };
  try {
    const body = await cal('/bookings', V_BOOKINGS, {
      method: 'POST',
      body: JSON.stringify({
        start: new Date(opts.startIso).toISOString(),
        eventTypeId: Number(env.CALCOM_EVENT_TYPE_ID),
        attendee: {
          name: opts.name || 'Aangan caller',
          email: opts.email || env.BOOKING_FALLBACK_EMAIL || 'studio@aanganstudio.in',
          timeZone: 'Asia/Kolkata',
          language: 'en',
          ...(opts.phone ? { phoneNumber: opts.phone } : {}),
        },
        // Hard rule 1: nothing price-related ever reaches a caller-facing invite.
        metadata: { ticket_no: opts.ticketNo },
        // When the caller gave no email the invite goes to the studio instead,
        // so note whose consultation it actually is.
        ...(opts.email ? {} : { guests: [] }),
        bookingFieldsResponses: {
          title: `Consultation — ${opts.ticketNo}`,
          notes: opts.notes ?? `Aangan enquiry ${opts.ticketNo}`,
        },
      }),
    });
    const d = body?.data ?? body;
    return { bookingUid: String(d?.uid ?? d?.id ?? ''), skipped: false };
  } catch (e) {
    return { bookingUid: null, skipped: false, error: String(e).slice(0, 300) };
  }
}

export async function calcomCancel(uid: string, reason = 'Released by Aangan Leads'): Promise<void> {
  if (!has.calcom() || !uid) return;
  await cal(`/bookings/${uid}/cancel`, V_BOOKINGS, {
    method: 'POST',
    body: JSON.stringify({ cancellationReason: reason }),
  }).catch(() => undefined);
}
