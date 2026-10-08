import { NextResponse, type NextRequest } from 'next/server';
import { one, sql } from '@/lib/db';
import { calcomBook } from '@/lib/calcom';
import { spokenSlot } from '@/lib/time';
import { toolAuthorised } from '@/lib/tool-auth';
import { logEvent } from '@/lib/leads';

export const runtime = 'nodejs';

/**
 * Called by Vaani DURING the call. Re-checks availability right before booking
 * (hard rule 4) and leans on the unique index on leads.booked_at as the real
 * guarantee. Idempotent on (vani_call_id, start).
 */
export async function POST(req: NextRequest) {
  if (!toolAuthorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    call_id?: string;
    start?: string;
    name?: string;
    email?: string;
    phone?: string;
  };

  const start = body.start ? new Date(body.start) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return NextResponse.json({ ok: false, say: 'I could not read that time — could you pick another slot?' }, { status: 200 });
  }
  if (start.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, say: 'That time has passed — shall I offer you another slot?' });
  }

  // Already taken?
  const clash = await one<{ id: string; vani_call_id: string }>(
    'select id, vani_call_id from leads where booked_at = $1',
    [start.toISOString()]
  );
  if (clash && clash.vani_call_id !== body.call_id) {
    return NextResponse.json({ ok: false, say: 'That one has just been taken — may I offer you another time?' });
  }
  if (clash && clash.vani_call_id === body.call_id) {
    return NextResponse.json({ ok: true, say: `You're confirmed for ${spokenSlot(start)}.`, already: true });
  }

  // Create a placeholder row if the call hasn't ended yet, so the slot is held.
  const lead = await one<{ id: string; ticket_no: string }>(
    `insert into leads (vani_call_id, caller_name, caller_email, caller_number, booked_at, stage, started_at)
     values ($1,$2,$3,$4,$5,'Consultation booked', now())
     on conflict (vani_call_id) do update set
       booked_at = excluded.booked_at,
       stage = 'Consultation booked',
       caller_name = coalesce(leads.caller_name, excluded.caller_name),
       caller_email = coalesce(leads.caller_email, excluded.caller_email)
     returning id, ticket_no`,
    [body.call_id ?? `hold-${start.getTime()}`, body.name ?? null, body.email ?? null, body.phone ?? null, start.toISOString()]
  ).catch(() => null);

  if (!lead) {
    // The unique index refused it — someone booked that second first.
    return NextResponse.json({ ok: false, say: 'That one has just been taken — may I offer you another time?' });
  }

  const booking = await calcomBook({
    startIso: start.toISOString(),
    name: body.name ?? '',
    email: body.email ?? '',
    phone: body.phone,
    ticketNo: lead.ticket_no,
  });
  if (booking.bookingId) {
    await sql('update leads set calcom_booking_id = $2 where id = $1', [lead.id, booking.bookingId]);
  }
  await logEvent({ lead_id: lead.id, type: 'booked', note: `Booked live in the call for ${spokenSlot(start)}.` }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    ticket_no: lead.ticket_no,
    // Hard rule 1: nothing about price, ever.
    say: `Done — ${spokenSlot(start)} at our studio. Your reference is ${lead.ticket_no}. You'll get an email invite shortly.`,
  });
}
