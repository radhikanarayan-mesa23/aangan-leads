import { env, has } from './env';
import { candidateSlots } from './time';

// ─────────────────────────────────────────────────────────────────────────────
// Cal.com API v2. ASSUME: endpoints below are v2 as documented at
// api.cal.com/v2 — /slots for availability and /bookings to create. If the real
// shapes differ, only this file changes. Without CALCOM_API_KEY the app falls
// back to the DB as the source of truth for which slots are taken, so the demo
// and the no-double-booking guarantee still work.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.cal.com/v2';

export type Slot = { iso: string; dateKey: string; hour: number; spoken: string };

/** Slots the studio could offer, minus the ones already taken in our DB. */
export function openSlots(takenIso: string[], from = new Date()): Slot[] {
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
}): Promise<{ bookingId: string | null; skipped: boolean; error?: string }> {
  if (!has.calcom()) return { bookingId: null, skipped: true };
  try {
    const res = await fetch(`${BASE}/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${env.CALCOM_API_KEY}`,
        'cal-api-version': '2024-08-13',
      },
      body: JSON.stringify({
        start: opts.startIso,
        eventTypeId: Number(env.CALCOM_EVENT_TYPE_ID),
        attendee: {
          name: opts.name || 'Aangan caller',
          email: opts.email || `${opts.ticketNo.toLowerCase()}@aangan.invalid`,
          phoneNumber: opts.phone ?? undefined,
          timeZone: 'Asia/Kolkata',
          language: 'en',
        },
        // Hard rule 1: nothing price-related ever goes into an invite.
        metadata: { ticket_no: opts.ticketNo },
        bookingFieldsResponses: { notes: opts.notes ?? `Consultation — ${opts.ticketNo}` },
      }),
    });
    if (!res.ok) return { bookingId: null, skipped: false, error: `Cal.com ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const body = (await res.json()) as any;
    return { bookingId: String(body?.data?.uid ?? body?.data?.id ?? body?.uid ?? ''), skipped: false };
  } catch (e) {
    return { bookingId: null, skipped: false, error: String(e) };
  }
}

export async function calcomCancel(bookingId: string): Promise<void> {
  if (!has.calcom() || !bookingId) return;
  await fetch(`${BASE}/bookings/${bookingId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CALCOM_API_KEY}`, 'cal-api-version': '2024-08-13', 'content-type': 'application/json' },
    body: JSON.stringify({ cancellationReason: 'Slot released by Aangan Leads' }),
  }).catch(() => undefined);
}
