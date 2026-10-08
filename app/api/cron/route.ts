import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { env, has } from '@/lib/env';
import { notifyLead } from '@/lib/pipeline';
import { digestMessage, sendTelegram } from '@/lib/telegram';
import { escapeHtml } from '@/lib/utils';
import { istParts } from '@/lib/time';
import { syncHubspot } from '@/lib/hubspot-sync';
import type { Stage } from '@/lib/stages';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Triggered every 10 minutes from cron-job.org with CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? '';
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const report: Record<string, unknown> = {};

  // 1. queued designer pushes whose 9am has arrived
  report.queued = await step(async () => {
    const due = await sql<{ id: string }>(
      'select id from leads where telegram_queued_for is not null and telegram_queued_for <= now() and telegram_sent_at is null'
    );
    let sent = 0;
    for (const row of due) {
      await sql('update leads set telegram_queued_for = null where id = $1', [row.id]);
      if ((await notifyLead(row.id)) === 'sent') sent++;
    }
    return { due: due.length, sent };
  });

  // 2. hot leads still sitting in New after an hour
  report.nudges = await step(async () => {
    const stale = await sql<{ id: string; ticket_no: string; caller_name: string | null }>(
      `select id, ticket_no, caller_name from leads
       where grade = 'HOT' and stage = 'New'
         and created_at < now() - interval '1 hour'
         and not exists (select 1 from lead_events e where e.lead_id = leads.id and e.type = 'note' and e.note like 'Nudge%')`
    );
    if (stale.length && has.telegram() && env.TELEGRAM_DESIGNER_CHAT_ID) {
      const list = stale.map((s) => `${escapeHtml(s.ticket_no)}${s.caller_name ? ` (${escapeHtml(s.caller_name)})` : ''}`).join(', ');
      await sendTelegram(env.TELEGRAM_DESIGNER_CHAT_ID, `⏰ <b>Still in New after an hour:</b> ${list}\n<a href="${env.APP_URL}/board">Open the board</a>`);
      for (const s of stale) {
        await sql("insert into lead_events (lead_id, type, note) values ($1,'note','Nudge sent — hot lead still in New.')", [s.id]);
      }
    }
    return { nudged: stale.length };
  });

  // 3. overdue callbacks (hard rule 3 — the promise is tracked, not just stored)
  report.callbacks = await step(async () => {
    const overdue = await sql<{ id: string; ticket_no: string }>(
      `select id, ticket_no from leads
       where callback_due_at is not null and callback_done_at is null
         and callback_due_at < now() and first_contact_at is null
         and not exists (select 1 from lead_events e where e.lead_id = leads.id and e.note = 'Callback overdue alert sent.')`
    );
    if (overdue.length && has.telegram() && env.TELEGRAM_DESIGNER_CHAT_ID) {
      await sendTelegram(
        env.TELEGRAM_DESIGNER_CHAT_ID,
        `📞 <b>Callback promise overdue:</b> ${overdue.map((o) => escapeHtml(o.ticket_no)).join(', ')}\n<a href="${env.APP_URL}/board">Open the board</a>`
      );
      for (const o of overdue) {
        await sql("insert into lead_events (lead_id, type, note) values ($1,'callback','Callback overdue alert sent.')", [o.id]);
      }
    }
    return { overdue: overdue.length };
  });

  // 4. retry failed HubSpot syncs
  report.hubspot = await step(async () => {
    const failed = await sql<{ id: string; stage: Stage }>(
      "select id, stage from leads where hubspot_sync_error is not null and stage <> 'New' limit 20"
    );
    for (const f of failed) await syncHubspot(f.id, f.stage);
    return { retried: failed.length };
  });

  // 5. the 9pm digest to Nikhil
  report.digest = await step(async () => {
    const { hour } = istParts(new Date());
    if (hour !== 21) return { skipped: 'not 9pm IST' };
    const already = await sql<{ c: string }>(
      "select count(*)::text c from lead_events where type = 'telegram' and note = 'Daily digest sent.' and at > now() - interval '12 hours'"
    );
    if (Number(already[0]?.c ?? 0) > 0) return { skipped: 'already sent' };

    const rows = await sql<{ grade: string; count: string }>(
      "select coalesce(grade,'UNGRADED') grade, count(*)::text from leads where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') group by 1 order by 1"
    );
    const cost = await sql<{ sum: string | null }>(
      "select coalesce(sum(cost_inr),0)::text sum from leads where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata')"
    );
    const hot = await sql<{ c: string }>("select count(*)::text c from leads where grade='HOT' and stage='New'");

    if (has.telegram() && env.TELEGRAM_OWNER_CHAT_ID) {
      await sendTelegram(
        env.TELEGRAM_OWNER_CHAT_ID,
        digestMessage(
          rows.map((r) => ({ grade: r.grade, count: Number(r.count) })),
          Number(cost[0]?.sum ?? 0),
          Number(hot[0]?.c ?? 0)
        )
      );
      const any = await sql<{ id: string }>('select id from leads order by created_at desc limit 1');
      if (any[0]) await sql("insert into lead_events (lead_id, type, note) values ($1,'telegram','Daily digest sent.')", [any[0].id]);
    }
    return { sent: true };
  });

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...report });
}

/** Each cron job is isolated — one failure must not stop the rest. */
async function step<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { error: String(e).slice(0, 300) };
  }
}
