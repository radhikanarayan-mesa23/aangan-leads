import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Chrome } from '@/components/Chrome';
import { SetupNeeded } from '@/components/SetupNeeded';
import { nextWorkingDays, SLOT_HOURS, slotInstant, fmtIST } from '@/lib/time';
import { GradeChip } from '@/components/Chips';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const days = nextWorkingDays(new Date(), 6);
  let booked;
  try {
    booked = await sql<{ id: string; ticket_no: string; caller_name: string | null; grade: string | null; booked_at: string }>(
      `select id, ticket_no, caller_name, grade, booked_at from leads
       where booked_at is not null and booked_at >= now() - interval '1 day'`
    );
  } catch (e) {
    return <SetupNeeded detail={String(e)} />;
  }
  const byIso = new Map(booked.map((b) => [new Date(b.booked_at).toISOString(), b]));

  return (
    <Chrome user={user} active="calendar">
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Consultation slots</h1>
        <p className="text-sm text-ink-2">Five one-hour slots a day on the shared studio calendar. A booked slot is never offered again.</p>
      </div>

      <div className="overflow-x-auto scrollbar-thin -mx-4 px-4 sm:-mx-6 sm:px-6">
        <div className="grid grid-flow-col auto-cols-[minmax(170px,1fr)] gap-3 min-w-max">
          {days.map((day) => (
            <div key={day}>
              <p className="text-sm font-medium mb-2">{fmtIST(slotInstant(day, 12), 'EEE d MMM')}</p>
              <div className="space-y-2">
                {SLOT_HOURS.map((h) => {
                  const at = slotInstant(day, h);
                  const b = byIso.get(at.toISOString());
                  const label = `${h > 12 ? h - 12 : h}pm`;
                  return b ? (
                    <Link
                      key={h}
                      href={`/board?lead=${b.id}`}
                      className="card p-2.5 block hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-ink-3 tabular-nums">{label}</span>
                        <GradeChip grade={b.grade} />
                      </div>
                      <p className="text-sm font-medium truncate mt-1">{b.caller_name ?? 'Caller'}</p>
                      <p className="text-[11px] text-ink-3 tabular-nums">{b.ticket_no}</p>
                    </Link>
                  ) : (
                    <div key={h} className="rounded-card border border-dashed border-line p-2.5 text-xs text-ink-3">
                      {label} · free
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}
