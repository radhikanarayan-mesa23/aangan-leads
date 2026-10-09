import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { one, sql } from '@/lib/db';
import { logEvent } from '@/lib/leads';
import { isProduction } from '@/lib/webhook-auth';

export const runtime = 'nodejs';

/**
 * Keeps our calendar honest when someone books or cancels inside Cal.com rather
 * than through the voice agent. Without this, a designer blocking a slot
 * directly would still be offered to the next caller — hard rule 4.
 *
 * Cal.com → Settings → Webhooks: subscribe BOOKING_CREATED and
 * BOOKING_CANCELLED to {APP_URL}/api/calcom/webhook with a secret.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verify(req.headers.get('x-cal-signature-256'), raw)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const trigger: string = body?.triggerEvent ?? '';
  const p = body?.payload ?? {};
  const uid: string | null = p?.uid ?? p?.bookingUid ?? null;
  const startTime: string | null = p?.startTime ?? p?.start ?? null;

  if (trigger === 'BOOKING_CREATED' && startTime) {
    const at = new Date(startTime).toISOString();

    // Did the voice agent already book this? Then just attach the Cal.com uid.
    const mine = await one<{ id: string }>('select id from leads where booked_at = $1', [at]);
    if (mine) {
      await sql('update leads set calcom_booking_uid = coalesce(calcom_booking_uid, $2) where id = $1', [mine.id, uid]);
      return NextResponse.json({ ok: true, matched: true });
    }

    // Booked directly in Cal.com. Hold the slot so we never offer it again.
    const attendee = (p?.attendees ?? [])[0] ?? {};
    const held = await one<{ id: string; ticket_no: string }>(
      `insert into leads (vani_call_id, caller_name, caller_email, booked_at, stage, started_at,
                          calcom_booking_uid, summary, grade, grade_reason)
       values ($1,$2,$3,$4,'Consultation booked', now(), $5,
               'Booked directly in Cal.com, not through the phone agent.', 'WARM',
               'Came in through Cal.com rather than a call, so there is no transcript to grade.')
       on conflict (vani_call_id) do nothing
       returning id, ticket_no`,
      [`calcom-${uid ?? at}`, attendee.name ?? p?.title ?? null, attendee.email ?? null, at, uid]
    ).catch(() => null);

    if (held) {
      await logEvent({ lead_id: held.id, type: 'booked', note: 'Slot booked directly in Cal.com.' }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, held: !!held });
  }

  if (trigger === 'BOOKING_CANCELLED' && uid) {
    const lead = await one<{ id: string }>('select id from leads where calcom_booking_uid = $1', [uid]);
    if (lead) {
      // Free the slot, but never drop the lead (hard rule 2).
      await sql(
        `update leads set booked_at = null, calcom_booking_uid = null, calcom_cancel_url = null,
           stage = case when stage = 'Consultation booked' then 'Contacted' else stage end
         where id = $1`,
        [lead.id]
      );
      await logEvent({ lead_id: lead.id, type: 'note', note: 'Consultation cancelled in Cal.com — the slot is free again.' });
    }
    return NextResponse.json({ ok: true, released: !!lead });
  }

  return NextResponse.json({ ok: true, ignored: trigger });
}

/** Cal.com signs the raw body with HMAC-SHA256, hex, in x-cal-signature-256. */
function verify(signature: string | null, raw: string): boolean {
  const secret = env.CALCOM_WEBHOOK_SECRET;
  // Unsigned requests are only tolerable on a developer's machine.
  if (!secret) return !isProduction();
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}
