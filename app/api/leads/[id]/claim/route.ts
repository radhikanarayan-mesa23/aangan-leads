import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { logEvent } from '@/lib/leads';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { assignee?: string | null; release?: boolean };
  const assignee = body.release ? null : body.assignee ?? user.email;

  await sql('update leads set assigned_to = $2 where id = $1', [id, assignee]);
  await logEvent({
    lead_id: id,
    by: user.email,
    type: 'note',
    note: assignee ? `Claimed by ${assignee}.` : 'Released back to the pool.',
  });
  return NextResponse.json({ ok: true, assigned_to: assignee });
}
