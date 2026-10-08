import { NextResponse, after, type NextRequest } from 'next/server';
import { one, sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getLead, logEvent } from '@/lib/leads';
import { isStage, validateStageMove, type Stage } from '@/lib/stages';
import { syncHubspot } from '@/lib/hubspot-sync';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    stage?: string;
    lost_reason?: string | null;
    deal_value_inr?: number | null;
  };

  if (!body.stage || !isStage(body.stage)) return NextResponse.json({ error: 'unknown stage' }, { status: 400 });
  const to = body.stage as Stage;

  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Hard rule 2: nothing is dropped silently — Not converted needs a reason.
  const complaint = validateStageMove(to, body);
  if (complaint) return NextResponse.json({ error: complaint }, { status: 400 });

  const from = lead.stage;
  if (from === to && body.deal_value_inr == null && body.lost_reason == null) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await sql(
    `update leads set
       stage = $2,
       stage_changed_at = now(),
       lost_reason = coalesce($3, lost_reason),
       deal_value_inr = coalesce($4, deal_value_inr),
       assigned_to = coalesce(assigned_to, $5),
       first_contact_at = case when first_contact_at is null and $2 <> 'New' then now() else first_contact_at end
     where id = $1`,
    [id, to, body.lost_reason ?? null, body.deal_value_inr ?? null, user.email]
  );

  await logEvent({
    lead_id: id,
    by: user.email,
    type: 'stage_change',
    from_stage: from,
    to_stage: to,
    note: body.lost_reason ? `Not converted — ${body.lost_reason}` : null,
  });

  // HubSpot sync in its own try/catch; the cron retries failures.
  after(async () => {
    await syncHubspot(id, to).catch(() => undefined);
  });

  return NextResponse.json({ ok: true, from, to });
}
