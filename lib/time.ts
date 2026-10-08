import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addDays, startOfDay } from 'date-fns';

export const TZ = 'Asia/Kolkata';

/** rubric.md §10 — slot hours, IST. */
export const SLOT_HOURS = [12, 13, 14, 15, 16];
export const SLOT_DAYS_AHEAD = 5;

/** ASSUME: working days are Mon–Sat (rubric.md §14 open question 1). */
export function isWorkingDay(d: Date): boolean {
  const day = Number(formatInTimeZone(d, TZ, 'i')); // 1 = Mon … 7 = Sun
  return day >= 1 && day <= 6;
}

export function istParts(d: Date) {
  return {
    hour: Number(formatInTimeZone(d, TZ, 'H')),
    minute: Number(formatInTimeZone(d, TZ, 'm')),
    dow: Number(formatInTimeZone(d, TZ, 'i')),
    dateKey: formatInTimeZone(d, TZ, 'yyyy-MM-dd'),
  };
}

/** The next N working days (IST), starting today if it is a working day. */
export function nextWorkingDays(from = new Date(), n = SLOT_DAYS_AHEAD): string[] {
  const out: string[] = [];
  let cursor = startOfDay(toZonedTime(from, TZ));
  for (let i = 0; out.length < n && i < 30; i++) {
    const day = addDays(cursor, i);
    const asUtc = fromZonedTime(day, TZ);
    if (isWorkingDay(asUtc)) out.push(formatInTimeZone(asUtc, TZ, 'yyyy-MM-dd'));
  }
  return out;
}

/** Build the UTC instant for an IST slot, e.g. ('2026-10-09', 14). */
export function slotInstant(dateKey: string, hour: number): Date {
  return fromZonedTime(`${dateKey}T${String(hour).padStart(2, '0')}:00:00`, TZ);
}

/** All candidate slots across the next working days, oldest first. */
export function candidateSlots(from = new Date(), n = SLOT_DAYS_AHEAD) {
  const out: { iso: string; dateKey: string; hour: number; spoken: string }[] = [];
  for (const dateKey of nextWorkingDays(from, n)) {
    for (const hour of SLOT_HOURS) {
      const at = slotInstant(dateKey, hour);
      if (at.getTime() <= from.getTime() + 60 * 60 * 1000) continue; // need an hour's notice
      out.push({ iso: at.toISOString(), dateKey, hour, spoken: spokenSlot(at) });
    }
  }
  return out;
}

/** "Thursday the 9th at 2pm" — what the agent reads aloud. */
export function spokenSlot(at: Date): string {
  const day = formatInTimeZone(at, TZ, 'EEEE');
  const dom = Number(formatInTimeZone(at, TZ, 'd'));
  const hour = Number(formatInTimeZone(at, TZ, 'H'));
  const h12 = hour > 12 ? hour - 12 : hour;
  return `${day} the ${ordinal(dom)} at ${h12}${hour >= 12 ? 'pm' : 'am'}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * rubric.md §10 — the callback promise, stored exactly as spoken (hard rule 3).
 * 10am–6pm on a working day → within 1 hour. Otherwise → by 11am the next working day.
 */
export function callbackPromise(now = new Date()): { dueAt: Date; spoken: string } {
  const { hour } = istParts(now);
  if (isWorkingDay(now) && hour >= 10 && hour < 18) {
    return { dueAt: new Date(now.getTime() + 60 * 60 * 1000), spoken: 'A designer will call you within 1 hour.' };
  }
  // next working day, 11:00 IST
  const todayKey = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const days = nextWorkingDays(new Date(now.getTime() + 6 * 60 * 60 * 1000), 3);
  const nextKey = days.find((d) => d > todayKey) ?? days[0];
  return { dueAt: slotInstant(nextKey, 11), spoken: 'A designer will call you by 11am tomorrow.' };
}

export const fmtIST = (d: Date | string | null | undefined, pattern = 'd MMM, h:mma') =>
  d ? formatInTimeZone(new Date(d), TZ, pattern) : '—';
