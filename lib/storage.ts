// Hard rule 9: recordings are private. The browser never receives the upstream
// Vaani URL — it asks /api/leads/:id/recording, which is auth-gated and streams
// the audio server-side.
//
// The database is Neon, so there is no Supabase Storage in the normal path:
// the recording's source URL stays server-side in the row and the audio is
// streamed through the route. The Supabase branch below is dormant and only
// wakes up if NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are ever set
// — keep it, because a Vaani recording URL can expire and a copy outlives it.
//
// TODO when recordings matter in production: copy to a bucket of our own
// (Vercel Blob or S3) so a lead's audio survives Vaani's retention window.

const BUCKET = 'recordings';

const supabaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function copyRecording(sourceUrl: string, ticketNo: string): Promise<string | null> {
  if (!sourceUrl || !supabaseConfigured()) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const audio = await fetch(sourceUrl);
  if (!audio.ok) throw new Error(`recording fetch ${audio.status}`);
  const bytes = await audio.arrayBuffer();
  const path = `${ticketNo}.mp3`;

  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': audio.headers.get('content-type') ?? 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return path;
}

/** Short-lived signed URL. Never handed to a caller, only to a signed-in designer. */
export async function signedRecordingUrl(path: string, seconds = 300): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${base}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { signedURL?: string };
  return body.signedURL ? `${base}/storage/v1${body.signedURL}` : null;
}
