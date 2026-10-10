import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { one, sql } from '@/lib/db';
import { logEvent } from '@/lib/leads';
import { callbackPromise } from '@/lib/time';

export const runtime = 'nodejs';

type Outcome = 'spoke' | 'no_answer' | 'call_later' | 'wrong_number';
const OUTCOMES: Outcome[] = ['spoke', 'no_answer', 'call_later', 'wrong_number'];

const WORDING: Record<Outcome, string> = {
  spoke: 'Spoke to the caller',
  no_answer: 'Called — no answer',
  call_later: 'Caller asked to be called later',
  wrong_number: 'Wrong number',
};

/**
 * Records what happened when a designer rang a lead.
 *
 * Before this, the only way to register activity was dragging a card, so
 * "called twice, nobody picked up" was invisible — and the callbacks-on-time
 * figure was measuring the missing button rather than the team.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { outcome?: string; note?: string; callback_at?: string };
  const outcome = body.outcome as Outcome;
  if (!OUTCOMES.includes(outcome)) return NextResponse.json({ error: 'unknown outcome' }, { status: 400 });

  const lead = await one<{ id: string; stage: string; call_attempts: number }>(
    'select id, stage, call_attempts from leads where id = $1',
    [id]
  );
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Reaching someone is first contact, and settles any promise we made.
  const reached = outcome === 'spoke' || outcome === 'wrong_number';

  // "Call me later" moves the promise rather than clearing it.
  const nextDue =
    outcome === 'call_later'
      ? body.callback_at
        ? new Date(body.callback_at)
        : callbackPromise(new Date()).dueAt
      : null;

  await sql(
    `update leads set
       call_attempts   = call_attempts + 1,
       last_attempt_at = now(),
       last_outcome    = $2,
       first_contact_at = case when $3 and first_contact_at is null then now() else first_contact_at end,
       callback_done_at = case when $3 then coalesce(callback_done_at, now()) else callback_done_at end,
       callback_due_at  = coalesce($4, callback_due_at),
       assigned_to      = coalesce(assigned_to, $5),
       stage = case when $3 and stage = 'New' then 'Contacted' else stage end,
       stage_changed_at = case when $3 and stage = 'New' then now() else stage_changed_at end
     where id = $1`,
    [id, outcome, reached, nextDue, user.email]
  );

  const attempt = (lead.call_attempts ?? 0) + 1;
  await logEvent({
    lead_id: id,
    by: user.email,
    type: 'note',
    note: `${WORDING[outcome]} (attempt ${attempt})${body.note?.trim() ? ` — ${body.note.trim()}` : ''}`,
  });

  // Moving out of New creates the HubSpot deal, same as dragging the card.
  if (reached && lead.stage === 'New') {
    const { syncHubspot } = await import('@/lib/hubspot-sync');
    syncHubspot(id, 'Contacted').catch(() => undefined);
    await logEvent({ lead_id: id, by: user.email, type: 'stage_change', from_stage: 'New', to_stage: 'Contacted' });
  }

  return NextResponse.json({ ok: true, outcome, attempts: attempt });
}
