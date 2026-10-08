import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getLead, listEvents } from '@/lib/leads';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const events = await listEvents(id);
  return NextResponse.json({
    lead,
    events,
    has_recording: !!(lead.recording_path || lead.recording_source_url),
  });
}
