import { env, has } from './env';
import { candidateSlots } from './time';

// ─────────────────────────────────────────────────────────────────────────────
// Calendly API v2 — the Scheduling API, which books on the invitee's behalf.
//
//   GET  /event_type_available_times   free slots for one event type
//   POST /invitees                     creates the booking (no invitee click)
//   POST /scheduled_events/{uuid}/cancellation
//
// Requires a paid Calendly plan; a free plan returns 403 on /invitees.
// Availability windows cannot span more than 31 days per request.
//
// Our own 12/1/2/3/4pm IST grid stays the thing the agent offers; Calendly is
// the authority on whether a slot is genuinely free. A slot must clear BOTH,
// and the unique index on leads.booked_at is the final guard (hard rule 4).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.calendly.com';

export type Slot = { iso: string; dateKey: string; hour: number; spoken: string };

async function cal(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.CALENDLY_API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Calendly ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as any) : {};
}

/**
 * The times Calendly says are open, as a set of ISO instants.
 * Returns null when Calendly is not configured or unreachable — callers then
 * fall back to our own database, so a Calendly outage never stops a booking.
 */
export async function calendlyAvailableTimes(fromIso: string, toIso: string): Promise<Set<string> | null> {
  if (!has.calendly()) return null;
  try {
    const qs = new URLSearchParams({
      event_type: env.CALENDLY_EVENT_TYPE_URI,
      start_time: fromIso,
      end_time: toIso,
    });
    const body = await cal(`/event_type_available_times?${qs}`);
    const times: string[] = (body.collection ?? [])
      .filter((s: any) => s.status === 'available')
      .map((s: any) => new Date(s.start_time).toISOString());
    return new Set(times);
  } catch {
    return null; // degrade to our own calendar rather than refusing to book
  }
}

/**
 * Slots the studio can offer: our grid, minus what we have already booked,
 * intersected with Calendly's availability when we can reach it.
 */
export async function openSlots(takenIso: string[], from = new Date()): Promise<Slot[]> {
  const taken = new Set(takenIso.map((t) => new Date(t).toISOString()));
  const ours = candidateSlots(from).filter((s) => !taken.has(new Date(s.iso).toISOString()));
  if (ours.length === 0) return [];

  const available = await calendlyAvailableTimes(ours[0].iso, ours[ours.length - 1].iso);
  if (!available) return ours;
  return ours.filter((s) => available.has(new Date(s.iso).toISOString()));
}

/** Synchronous variant for tests and for when Calendly is deliberately bypassed. */
export function openSlotsFromDb(takenIso: string[], from = new Date()): Slot[] {
  const taken = new Set(takenIso.map((t) => new Date(t).toISOString()));
  return candidateSlots(from).filter((s) => !taken.has(new Date(s.iso).toISOString()));
}

export async function calendlyBook(opts: {
  startIso: string;
  name: string;
  email: string;
  phone?: string | null;
  ticketNo: string;
  notes?: string;
}): Promise<{ eventUri: string | null; cancelUrl?: string; rescheduleUrl?: string; skipped: boolean; error?: string }> {
  if (!has.calendly()) return { eventUri: null, skipped: true };
  try {
    const body = await cal('/invitees', {
      method: 'POST',
      body: JSON.stringify({
        event_type: env.CALENDLY_EVENT_TYPE_URI,
        // Calendly requires a UTC instant ending in Z.
        start_time: new Date(opts.startIso).toISOString(),
        invitee: {
          name: opts.name || 'Aangan caller',
          email: opts.email || `${opts.ticketNo.toLowerCase()}@aangan.invalid`,
          timezone: 'Asia/Kolkata',
          ...(opts.phone ? { text_reminder_number: opts.phone } : {}),
        },
        // Omitted entirely when the event type has no location — Calendly
        // rejects the request if a location is sent for a location-less type.
        ...(env.CALENDLY_LOCATION_KIND ? { location: { kind: env.CALENDLY_LOCATION_KIND } } : {}),
        // Hard rule 1: nothing price-related ever reaches a caller-facing invite.
        tracking: { utm_source: 'aangan-leads', utm_campaign: opts.ticketNo },
      }),
    });
    const resource = body.resource ?? body;
    return {
      eventUri: String(resource.event ?? resource.uri ?? ''),
      cancelUrl: resource.cancel_url,
      rescheduleUrl: resource.reschedule_url,
      skipped: false,
    };
  } catch (e) {
    return { eventUri: null, skipped: false, error: String(e).slice(0, 300) };
  }
}

export async function calendlyCancel(eventUri: string, reason = 'Released by Aangan Leads'): Promise<void> {
  if (!has.calendly() || !eventUri) return;
  const uuid = eventUri.split('/').pop();
  if (!uuid) return;
  await cal(`/scheduled_events/${uuid}/cancellation`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }).catch(() => undefined);
}
