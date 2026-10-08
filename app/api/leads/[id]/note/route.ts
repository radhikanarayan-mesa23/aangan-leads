import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { logEvent } from '@/lib/leads';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { note?: string; callback_done?: boolean };

  if (body.callback_done) {
    await sql('update leads set callback_done_at = now() where id = $1', [id]);
    await logEvent({ lead_id: id, by: user.email, type: 'callback', note: 'Callback made.' });
  }
  if (body.note?.trim()) {
    await logEvent({ lead_id: id, by: user.email, type: 'note', note: body.note.trim().slice(0, 2000) });
  }
  return NextResponse.json({ ok: true });
}
