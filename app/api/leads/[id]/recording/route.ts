import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getLead } from '@/lib/leads';
import { signedRecordingUrl } from '@/lib/storage';

export const runtime = 'nodejs';

// Hard rule 9: the browser never sees the upstream URL. A signed-in designer
// gets a short-lived signed URL, or the audio is streamed through this route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (lead.recording_path) {
    const signed = await signedRecordingUrl(lead.recording_path);
    if (signed) return NextResponse.redirect(signed);
  }

  if (!lead.recording_source_url) return NextResponse.json({ error: 'no recording' }, { status: 404 });

  const upstream = await fetch(lead.recording_source_url);
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: 'recording unavailable' }, { status: 502 });

  return new NextResponse(upstream.body, {
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      'cache-control': 'private, max-age=60',
    },
  });
}
