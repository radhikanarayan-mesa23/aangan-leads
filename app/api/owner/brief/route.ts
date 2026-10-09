import { NextResponse, type NextRequest } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { currentUser } from '@/lib/auth';
import { briefAsCsv, briefAsMarkdown, buildDailyBrief } from '@/lib/brief';
import { env } from '@/lib/env';
import { constantTimeEqual } from '@/lib/webhook-auth';
import { TZ } from '@/lib/time';

export const runtime = 'nodejs';

/**
 * Nikhil's daily brief as a file. Owner-only — it carries internal estimates,
 * which must never reach a caller (hard rule 1). The cron secret also opens it
 * so the 9pm Telegram digest can link straight to a download.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  const token = req.nextUrl.searchParams.get('t') ?? '';
  const viaCron = !!env.CRON_SECRET && constantTimeEqual(env.CRON_SECRET, token);

  if (!viaCron && user?.role !== 'owner') {
    return NextResponse.json({ error: 'owner only' }, { status: user ? 403 : 401 });
  }

  const brief = await buildDailyBrief();
  const stamp = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  const csv = req.nextUrl.searchParams.get('format') === 'csv';

  return new NextResponse(csv ? briefAsCsv(brief) : briefAsMarkdown(brief), {
    headers: {
      'content-type': csv ? 'text/csv; charset=utf-8' : 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="aangan-${stamp}.${csv ? 'csv' : 'md'}"`,
      'cache-control': 'no-store',
    },
  });
}
