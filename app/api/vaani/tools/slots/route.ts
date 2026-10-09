import { NextResponse, type NextRequest } from 'next/server';
import { openSlots } from '@/lib/calendly';
import { toolAuth } from '@/lib/tool-auth';
import { takenSlots } from '@/lib/leads';

export const runtime = 'nodejs';

// Called by Vaani DURING the call. Must answer in under 2s, so the result is
// cached for 30s and read from our own DB rather than Cal.com.
let cache: { at: number; body: unknown } | null = null;

export async function POST(req: NextRequest) {
  const auth = toolAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (cache && Date.now() - cache.at < 30_000) return NextResponse.json(cache.body);

  const taken = await takenSlots();
  const slots = (await openSlots(taken)).slice(0, 8);
  const body = {
    // What the agent reads aloud, and what it sends back to /book.
    spoken: slots.map((s) => s.spoken),
    slots: slots.map((s) => ({ iso: s.iso, spoken: s.spoken })),
    say: slots.length
      ? `I have ${slots.slice(0, 3).map((s) => s.spoken).join(', ')} — would any of those suit you?`
      : 'All our consultation slots this week are taken — a designer will call you instead.',
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
