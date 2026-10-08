import { env, has } from './env';
import { escapeHtml } from './utils';
import { istParts } from './time';

/** Designer pushes between 9pm and 9am IST are queued for 9am (CLAUDE.md §10). */
export function isQuietHours(now = new Date()): boolean {
  const { hour } = istParts(now);
  return hour >= 21 || hour < 9;
}

export async function sendTelegram(chatId: string, html: string): Promise<void> {
  if (!has.telegram()) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('Telegram chat id is empty');
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export type LeadPush = {
  ticket_no: string;
  grade: string;
  caller_name?: string | null;
  locality?: string | null;
  property_type?: string | null;
  scope?: string | null;
  booked_at?: string | null;
  id: string;
};

/** Caller text is escaped (hard rule 10). No price ever appears here (hard rule 1). */
export function leadMessage(lead: LeadPush): string {
  const icon = lead.grade === 'HOT' ? '🔥' : lead.grade === 'ESCALATE' ? '🔴' : '🟡';
  const label = lead.grade === 'HOT' ? 'Hot lead' : lead.grade === 'ESCALATE' ? 'URGENT — existing client' : 'Warm lead';
  const bits = [lead.locality, lead.property_type, humanScope(lead.scope)].filter(Boolean).map((b) => escapeHtml(String(b)));
  const who = lead.caller_name ? ` — ${escapeHtml(lead.caller_name)}` : '';
  const context = bits.length ? ` (${bits.join(' · ')})` : '';
  const link = `${env.APP_URL}/board?lead=${lead.id}`;
  const ask = lead.grade === 'ESCALATE' ? 'Please call them back now.' : 'Please update it on the board.';
  return `${icon} <b>${label} ${escapeHtml(lead.ticket_no)}</b>${who}${context} is on your board. ${ask}\n<a href="${link}">Open the card</a>`;
}

export function humanScope(scope?: string | null): string | null {
  if (!scope) return null;
  return (
    { full_home: 'full home', partial: 'partial home', single_room: 'single room', painting: 'painting only', office: 'office fit-out', other: 'other' } as Record<string, string>
  )[scope] ?? scope;
}

export function digestMessage(rows: { grade: string; count: number }[], cost: number, hotInNew: number): string {
  const line = rows.map((r) => `${r.grade}: ${r.count}`).join(' · ');
  return [
    '🌙 <b>Aangan — today</b>',
    line || 'No calls today.',
    `Cost today: ₹${cost.toFixed(0)}`,
    hotInNew ? `⚠️ ${hotInNew} hot lead(s) still sitting in New.` : '✅ No hot leads left untouched.',
    `<a href="${env.APP_URL}/owner">Open the dashboard</a>`,
  ].join('\n');
}
