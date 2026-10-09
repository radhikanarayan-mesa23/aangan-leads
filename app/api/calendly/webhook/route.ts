import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { one, sql } from '@/lib/db';
import { logEvent } from '@/lib/leads';
import { isProduction } from '@/lib/webhook-auth';

export const runtime = 'nodejs';

/**
 * Keeps our calendar honest when someone books or cancels inside Calendly
 * rather than through the voice agent. Without this, a designer blocking a slot
 * directly would still be offered to the next caller — hard rule 4.
 *
 * Subscribe at Calendly → Webhooks for `invitee.created` and `invitee.canceled`,
 * pointing at {APP_URL}/api/calendly/webhook.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verify(req.headers.get('calendly-webhook-signature'), raw)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const kind: string = body?.event ?? '';
  const p = body?.payload ?? {};
  const eventUri: string | null = p?.scheduled_event?.uri ?? p?.event ?? null;
  const startTime: string | null = p?.scheduled_event?.start_time ?? null;

  if (kind === 'invitee.created' && startTime) {
    const at = new Date(startTime).toISOString();

    // Did the voice agent already book this? Then just attach the Calendly ids.
    const mine = await one<{ id: string }>('select id from leads where booked_at = $1', [at]);
    if (mine) {
      await sql('update leads set calendly_event_uri = coalesce(calendly_event_uri, $2) where id = $1', [mine.id, eventUri]);
      return NextResponse.json({ ok: true, matched: true });
    }

    // Booked directly in Calendly. Hold the slot so we never offer it again.
    const held = await one<{ id: string; ticket_no: string }>(
      `insert into leads (vani_call_id, caller_name, caller_email, booked_at, stage, started_at,
                          calendly_event_uri, summary, grade, grade_reason)
       values ($1,$2,$3,$4,'Consultation booked', now(), $5,
               'Booked directly in Calendly, not through the phone agent.', 'WARM',
               'Came in through Calendly rather than a call, so there is no transcript to grade.')
       on conflict (vani_call_id) do nothing
       returning id, ticket_no`,
      [`calendly-${eventUri?.split('/').pop() ?? at}`, p?.name ?? null, p?.email ?? null, at, eventUri]
    ).catch(() => null);

    if (held) {
      await logEvent({ lead_id: held.id, type: 'booked', note: 'Slot booked directly in Calendly.' }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, held: !!held });
  }

  if (kind === 'invitee.canceled' && eventUri) {
    const lead = await one<{ id: string; stage: string }>('select id, stage from leads where calendly_event_uri = $1', [eventUri]);
    if (lead) {
      // Free the slot, but never drop the lead (hard rule 2).
      await sql(
        `update leads set booked_at = null, calendly_event_uri = null, calendly_cancel_url = null,
           stage = case when stage = 'Consultation booked' then 'Contacted' else stage end
         where id = $1`,
        [lead.id]
      );
      await logEvent({ lead_id: lead.id, type: 'note', note: 'Consultation cancelled in Calendly — the slot is free again.' });
    }
    return NextResponse.json({ ok: true, released: !!lead });
  }

  return NextResponse.json({ ok: true, ignored: kind });
}

/** Calendly signs as `t=<unix>,v1=<hex hmac of "t.body">`. */
function verify(header: string | null, raw: string): boolean {
  const key = env.CALENDLY_WEBHOOK_SIGNING_KEY;
  // Unsigned requests are only tolerable on a developer's machine.
  if (!key) return !isProduction();
  if (!header) return false;

  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  // Reject anything older than five minutes, so a captured call cannot be replayed.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = createHmac('sha256', key).update(`${t}.${raw}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
