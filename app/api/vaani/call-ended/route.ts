import { NextResponse, after, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { requireSecret } from '@/lib/webhook-auth';
import { normalizeVaniPayload } from '@/lib/vaani';
import { processLead, upsertCall } from '@/lib/pipeline';
import { logEvent } from '@/lib/leads';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 1. verify the secret
  const auth = requireSecret(
    env.VAANI_WEBHOOK_SECRET,
    req.headers.get('x-vaani-secret') ?? req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret'),
    'VAANI_WEBHOOK_SECRET'
  );
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // 2. normalise — the only place that knows Vaani's shape
  const call = normalizeVaniPayload(raw);

  // 3. upsert on vani_call_id (idempotent, hard rule 7)
  let lead;
  try {
    lead = await upsertCall(call);
  } catch (e) {
    console.error('call-ended upsert failed', e);
    return NextResponse.json({ error: 'storage failed' }, { status: 500 });
  }

  const alreadyGraded = !!lead.grade;
  if (!alreadyGraded) {
    await logEvent({ lead_id: lead.id, type: 'created', note: `Call ${call.vani_call_id} stored.` }).catch(() => undefined);
  }

  // 4. return 200 immediately, then do the slow work
  after(async () => {
    if (alreadyGraded) return; // replayed webhook — nothing to redo
    try {
      await processLead(lead!.id);
    } catch (e) {
      console.error('processLead failed', e);
    }
  });

  return NextResponse.json({ ok: true, ticket_no: lead.ticket_no, lead_id: lead.id, replayed: alreadyGraded });
}
