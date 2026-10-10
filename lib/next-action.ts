import type { LeadRow } from './leads';

/**
 * What this lead needs from a designer right now.
 *
 * The board used to be a list of leads sorted by grade. This turns it into a
 * worklist: every card says what to do and how late it is, so a designer
 * opening it from a Telegram push at 9am knows where to start without reading
 * fourteen cards.
 */
export type Urgency = 'overdue' | 'now' | 'soon' | 'later' | 'done';

export type NextAction = { label: string; urgency: Urgency; at?: string | null };

export function nextAction(lead: {
  grade: string | null;
  stage: string;
  created_at: string;
  booked_at: string | null;
  callback_due_at: string | null;
  callback_done_at: string | null;
  first_contact_at: string | null;
  call_attempts?: number;
  last_attempt_at?: string | null;
  last_outcome?: string | null;
  lost_reason?: string | null;
}, now = new Date()): NextAction {
  const t = now.getTime();
  const mins = (d: string | null) => (d ? Math.round((new Date(d).getTime() - t) / 60000) : null);

  // Wrong numbers, sales pitches and job seekers are not leads — nobody rings
  // them back. They stay on the board (nothing is dropped silently) but they
  // never ask for anyone's time.
  if (lead.grade === 'NOT_ENQUIRY') return { label: 'Not an enquiry', urgency: 'done' };
  if (lead.last_outcome === 'wrong_number') return { label: 'Wrong number', urgency: 'done' };

  if (lead.stage === 'Not converted') return { label: 'Closed', urgency: 'done' };
  if (lead.stage === 'Converted' || lead.stage === 'Completed') return { label: 'Won', urgency: 'done' };

  // An existing client with a complaint outranks every sales consideration.
  if (lead.grade === 'ESCALATE' && !lead.first_contact_at) {
    return { label: 'Call back now — existing client', urgency: 'overdue' };
  }

  // What the designer last did outranks what we promised — someone who has
  // just tried and got no answer should be told to try again, not nagged with
  // the same overdue callback they are already chasing.
  if (lead.last_outcome === 'no_answer') {
    const n = lead.call_attempts ?? 1;
    const since = lead.last_attempt_at ? Math.round((t - new Date(lead.last_attempt_at).getTime()) / 60000) : null;
    if (n >= 3) return { label: `${n} attempts, no answer — decide`, urgency: 'now' };
    // Give them an hour before asking for the next attempt.
    if (since != null && since < 60) return { label: `No answer — try again in ${fmtIn(60 - since)}`, urgency: 'later' };
    return { label: `Try again (attempt ${n + 1})`, urgency: 'now' };
  }
  if (lead.last_outcome === 'call_later') return { label: 'They asked to be called later', urgency: 'soon' };

  // A promise we made on the call.
  if (lead.callback_due_at && !lead.callback_done_at && !lead.first_contact_at) {
    const m = mins(lead.callback_due_at)!;
    if (m < 0) return { label: `Callback ${fmtAgo(-m)} overdue`, urgency: 'overdue', at: lead.callback_due_at };
    return { label: `Call back within ${fmtIn(m)}`, urgency: m <= 30 ? 'now' : 'soon', at: lead.callback_due_at };
  }

  // A consultation on the calendar.
  if (lead.booked_at) {
    const m = mins(lead.booked_at)!;
    if (m < -60) return { label: 'Consultation done — log the outcome', urgency: 'now', at: lead.booked_at };
    if (m < 0) return { label: 'Consultation in progress', urgency: 'later', at: lead.booked_at };
    if (m < 120) return { label: `Consultation in ${fmtIn(m)}`, urgency: 'now', at: lead.booked_at };
    return { label: 'Consultation booked', urgency: 'later', at: lead.booked_at };
  }

  // Never touched.
  if (lead.stage === 'New') {
    const age = Math.round((t - new Date(lead.created_at).getTime()) / 60000);
    if (lead.grade === 'HOT') {
      return age > 60
        ? { label: `Hot and unclaimed for ${fmtAgo(age)}`, urgency: 'overdue' }
        : { label: 'Claim and call', urgency: 'now' };
    }
    return { label: 'Claim and call', urgency: age > 24 * 60 ? 'now' : 'soon' };
  }

  if (lead.stage === 'Proposal sent') return { label: 'Chase the proposal', urgency: 'soon' };
  if (lead.stage === 'Site visit') return { label: 'Send the proposal', urgency: 'soon' };
  if (lead.stage === 'Contacted') return { label: 'Book the consultation', urgency: 'soon' };
  return { label: 'Move it along', urgency: 'later' };
}

const fmtIn = (m: number) => (m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} days`);
const fmtAgo = (m: number) => (m < 60 ? `${m}m` : m < 24 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`);

export const URGENCY_STYLE: Record<Urgency, string> = {
  overdue: 'fit-below',
  now: 'fit-close',
  soon: 'fit-unknown',
  later: 'fit-unknown',
  done: 'fit-fits',
};

export const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, now: 1, soon: 2, later: 3, done: 4 };
