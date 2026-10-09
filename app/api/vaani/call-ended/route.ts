import { NextResponse, after, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { normalizeVaniPayload, readEnvelope } from '@/lib/vaani';
import { processLead, upsertCall } from '@/lib/pipeline';
import { logEvent } from '@/lib/leads';
import { one, sql } from '@/lib/db';
import { isProduction, constantTimeEqual } from '@/lib/webhook-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * VaaniVoice outbound webhook receiver.
 *
 * Per their spec: delivery is retried up to 8 times with the SAME `evt_` id,
 * so idempotency keys on that as well as on the call id. Any 2xx acknowledges;
 * anything else earns a retry, and five consecutive failures auto-disable the
 * subscription — so this returns 200 for anything it recognises but cannot act
 * on, and only errors when the problem is genuinely ours.
 */
export async function POST(req: NextRequest) {
  // The raw bytes are what the signature covers — read them before parsing.
  const raw = await req.text();

  const auth = verify(req, raw);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const envelope = readEnvelope(body);
  const eventType = req.headers.get('x-vaanivoice-event') ?? envelope.type;

  // The dashboard "Test" button. Acknowledge so the subscription stays healthy.
  if (eventType === 'webhook.ping') {
    return NextResponse.json({ ok: true, pong: true });
  }

  // Events that are not a finished phone call. Acknowledged, not processed.
  if (eventType && !['call.completed', 'call.failed', 'lead.created'].includes(eventType)) {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  // Retries reuse the event id, so a replay must not redo the work.
  if (envelope.event_id) {
    const seen = await one<{ id: string }>(
      "select id from leads where raw_payload->>'__event_id' = $1",
      [envelope.event_id]
    ).catch(() => null);
    if (seen) return NextResponse.json({ ok: true, replayed: true });
  }

  const call = normalizeVaniPayload(body);
  if (envelope.event_id) {
    (call.raw as any) = { ...(call.raw as any), __event_id: envelope.event_id };
  }

  let lead;
  try {
    lead = await upsertCall(call);
  } catch (e) {
    console.error('call-ended upsert failed', e);
    // Ours, not theirs — a non-2xx asks Vaani to retry, which is what we want.
    return NextResponse.json({ error: 'storage failed' }, { status: 500 });
  }

  const alreadyGraded = !!lead.grade;
  if (!alreadyGraded) {
    await logEvent({ lead_id: lead.id, type: 'created', note: `Call ${call.vani_call_id} stored (${eventType ?? 'call.completed'}).` }).catch(() => undefined);
  }

  // A call that failed on their side has no transcript worth grading, but the
  // caller still rang: keep the row so nothing is silently dropped.
  if (eventType === 'call.failed') {
    await sql("update leads set ended_reason = coalesce(ended_reason, 'failed') where id = $1", [lead.id]).catch(() => undefined);
    return NextResponse.json({ ok: true, ticket_no: lead.ticket_no, graded: false });
  }

  after(async () => {
    if (alreadyGraded) return;
    try {
      await processLead(lead!.id);
    } catch (e) {
      console.error('processLead failed', e);
    }
  });

  return NextResponse.json({ ok: true, ticket_no: lead.ticket_no, lead_id: lead.id, replayed: alreadyGraded });
}

/**
 * Two accepted forms:
 *  1. VaaniVoice — `X-VaaniVoice-Signature: sha256=<hex>`, HMAC-SHA256 of the
 *     raw body keyed with the `vv_whk_…` secret from the dashboard.
 *  2. A plain shared secret header, for replay scripts and any other source.
 */
function verify(req: NextRequest, raw: string): { ok: true } | { ok: false; status: number; error: string } {
  const secret = env.VAANI_WEBHOOK_SECRET;

  if (!secret) {
    // An unconfigured secret is only tolerable on a developer's machine.
    return isProduction()
      ? { ok: false, status: 503, error: 'VAANI_WEBHOOK_SECRET is not configured on this deployment' }
      : { ok: true };
  }

  const signature = req.headers.get('x-vaanivoice-signature');
  if (signature) {
    const m = /^sha256=([0-9a-f]{64})$/.exec(signature.trim());
    if (!m) return { ok: false, status: 401, error: 'malformed signature' };
    const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(m[1]);
    const good = a.length === b.length && timingSafeEqual(a, b);
    return good ? { ok: true } : { ok: false, status: 401, error: 'bad signature' };
  }

  const supplied =
    req.headers.get('x-vaani-secret') ??
    req.headers.get('x-webhook-secret') ??
    req.nextUrl.searchParams.get('secret') ??
    '';
  return constantTimeEqual(secret, supplied) ? { ok: true } : { ok: false, status: 401, error: 'unauthorised' };
}
