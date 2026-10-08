'use client';

import { useEffect, useState } from 'react';
import { STAGES, type Stage } from '@/lib/stages';
import { GradeChip, FitChip, InternalBadge, Flag } from './Chips';
import { inr } from '@/lib/pricing';
import { humanScope } from '@/lib/telegram';
import { fmtIST } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { LeadDetailData } from '@/lib/view';

export function LeadDetail({
  leadId,
  users,
  me,
  onClose,
  onMoved,
}: {
  leadId: string;
  users: { email: string; name: string; role: string }[];
  me: { email: string; name: string; role: string };
  onClose: () => void;
  onMoved: () => void;
}) {
  const [data, setData] = useState<LeadDetailData | null>(null);
  const [tab, setTab] = useState<'brief' | 'call' | 'activity'>('brief');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const lead = data?.lead;
  const f = (lead?.fields ?? {}) as Record<string, any>;

  async function changeStage(to: Stage) {
    setError(null);
    const extra: Record<string, unknown> = {};
    if (to === 'Not converted') {
      const reason = window.prompt('Why is this one not converting?');
      if (!reason?.trim()) return;
      extra.lost_reason = reason.trim();
    }
    if (to === 'Proposal sent') {
      const v = window.prompt('Proposal value (₹):', String(lead?.deal_value_inr ?? ''));
      const num = Number(String(v ?? '').replace(/[^\d]/g, ''));
      if (!num) return;
      extra.deal_value_inr = num;
    }
    setBusy(true);
    const res = await fetch(`/api/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: to, ...extra }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
    onMoved();
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    await fetch(`/api/leads/${leadId}/note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    setNote('');
    setBusy(false);
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button className="absolute inset-0 bg-black/20" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full sm:w-[520px] h-full bg-surface border-l border-line overflow-y-auto scrollbar-thin shadow-pop">
        {!lead ? (
          <div className="p-6 text-sm text-ink-3">Loading…</div>
        ) : (
          <>
            {/* header */}
            <div className="sticky top-0 bg-[var(--surface-blur)] backdrop-blur border-b border-line px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold truncate">{lead.caller_name ?? 'Unnamed caller'}</h2>
                  <p className="text-xs text-ink-3 tabular-nums">
                    {lead.ticket_no} · {fmtIST(lead.started_at ?? lead.created_at)} · {lead.duration_s ?? 0}s
                  </p>
                </div>
                <button className="btn" onClick={onClose}>Close</button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <GradeChip grade={lead.grade} />
                <FitChip fit={lead.budget_fit} />
                {lead.flags?.map((fl) => <Flag key={fl}>{fl.toLowerCase().replace(/_/g, ' ')}</Flag>)}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {lead.caller_number && (
                  <a className="btn btn-primary" href={`tel:${lead.caller_number}`}>Call {lead.caller_number}</a>
                )}
                <select
                  className="input w-auto"
                  value={lead.stage}
                  disabled={busy}
                  onChange={(e) => changeStage(e.target.value as Stage)}
                >
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  className="input w-auto"
                  value={lead.assigned_to ?? ''}
                  onChange={async (e) => {
                    await fetch(`/api/leads/${leadId}/claim`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ assignee: e.target.value || null, release: !e.target.value }),
                    });
                    await load();
                    onMoved();
                  }}
                >
                  <option value="">Unclaimed</option>
                  {users.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                </select>
              </div>
              {error && <p className="mt-2 text-sm text-[var(--hot)]">{error}</p>}

              <nav className="mt-4 flex gap-1">
                {(['brief', 'call', 'activity'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-card capitalize',
                      tab === t ? 'bg-surface-2 font-medium' : 'text-ink-2 hover:bg-surface-2'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </nav>
            </div>

            <div className="px-5 py-4 space-y-5">
              {tab === 'brief' && (
                <>
                  {lead.summary && (
                    <section>
                      <p className="label mb-1.5">Summary</p>
                      <p className="text-sm leading-relaxed">{lead.summary}</p>
                    </section>
                  )}

                  <section>
                    <p className="label mb-2">Requirement</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <KV k="Property" v={f.property_type} />
                      <KV k="Carpet area" v={f.carpet_area_sqft ? `${f.carpet_area_sqft} sq ft` : null} />
                      <KV k="Locality" v={f.locality} />
                      <KV k="Scope" v={humanScope(f.scope)} />
                      <KV k="Rooms" v={(f.rooms ?? []).join(', ')} />
                      <KV k="State" v={f.current_state} />
                      <KV k="Ownership" v={f.ownership} />
                      <KV k="Style" v={f.style} />
                      <KV k="Needs it by" v={f.completion_needed_by} />
                      <KV k="Decision" v={f.decision_maker} />
                      <KV k="Heard via" v={f.source} />
                      <KV k="Email" v={lead.caller_email} />
                    </dl>
                  </section>

                  {/* Hard rule 1: internal only, said out loud. */}
                  <section className="card p-3.5 bg-surface-2">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="label">Budget vs internal estimate</p>
                      <InternalBadge />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <KV
                        k="They said"
                        v={
                          f.budget_volunteered
                            ? `${inr(f.budget_inr_min)}${f.budget_inr_max && f.budget_inr_max !== f.budget_inr_min ? ` – ${inr(f.budget_inr_max)}` : ''}`
                            : 'Not stated'
                        }
                      />
                      <KV k="Our estimate" v={`${inr(Number(lead.est_min_inr) || null)} – ${inr(Number(lead.est_max_inr) || null)}`} />
                    </div>
                    {f.estimate_basis && <p className="mt-2 text-[11px] text-ink-3">{f.estimate_basis}</p>}
                    <p className="mt-2 text-sm leading-relaxed">{lead.grade_reason}</p>
                    {lead.gemini_grade && lead.gemini_grade !== lead.grade && (
                      <p className="mt-1.5 text-[11px] text-ink-3">
                        Gemini said {lead.gemini_grade}; the budget maths in code overrode it.
                      </p>
                    )}
                  </section>

                  <section>
                    <p className="label mb-2">Criteria</p>
                    <ul className="space-y-1.5 text-sm">
                      {Object.entries(lead.criteria ?? {}).map(([k, c]: [string, any]) => (
                        <li key={k} className="flex gap-2">
                          <span
                            className={cn(
                              'chip shrink-0',
                              c.result === 'pass' ? 'fit-fits' : c.result === 'fail' ? 'fit-below' : 'fit-close'
                            )}
                          >
                            {k} {c.result}
                          </span>
                          <span className="text-ink-2 leading-5">{c.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  {lead.handoff_note && (
                    <section>
                      <p className="label mb-1.5">Handoff note</p>
                      <p className="text-sm leading-relaxed">{lead.handoff_note}</p>
                      {lead.insights?.suggested_opener && (
                        <p className="mt-2 text-sm italic text-ink-2 border-l-2 border-line pl-3">
                          “{lead.insights.suggested_opener}”
                        </p>
                      )}
                    </section>
                  )}

                  {!!lead.off_script_questions?.length && (
                    <section>
                      <p className="label mb-1.5">They asked, off-script</p>
                      <ul className="list-disc pl-5 text-sm space-y-1 text-ink-2">
                        {lead.off_script_questions.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </section>
                  )}

                  {(lead.booked_at || lead.callback_due_at) && (
                    <section className="card p-3.5">
                      {lead.booked_at && <p className="text-sm">📅 Consultation booked for <b>{fmtIST(lead.booked_at, 'EEEE d MMM, h:mma')}</b></p>}
                      {lead.callback_due_at && (
                        <div className="mt-1.5 flex items-center justify-between gap-3">
                          <p className="text-sm">
                            ☎️ Callback promised by <b>{fmtIST(lead.callback_due_at, 'EEE d MMM, h:mma')}</b>
                            {lead.callback_done_at && ' · done'}
                          </p>
                          {!lead.callback_done_at && (
                            <button
                              className="btn"
                              onClick={async () => {
                                await fetch(`/api/leads/${leadId}/note`, {
                                  method: 'POST',
                                  headers: { 'content-type': 'application/json' },
                                  body: JSON.stringify({ callback_done: true }),
                                });
                                await load();
                              }}
                            >
                              Mark done
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}

              {tab === 'call' && (
                <>
                  <section>
                    <p className="label mb-2">Recording</p>
                    {data?.has_recording ? (
                      <audio controls preload="none" className="w-full" src={`/api/leads/${leadId}/recording`} />
                    ) : (
                      <p className="text-sm text-ink-3">No recording on this call.</p>
                    )}
                  </section>
                  <section>
                    <p className="label mb-2">Transcript</p>
                    <div className="space-y-2.5">
                      {(lead.transcript ?? []).map((t: any, i: number) => (
                        <div key={i} className={cn('text-sm leading-relaxed', t.speaker === 'agent' ? 'text-ink-2' : '')}>
                          <span className="label mr-2">{t.speaker === 'agent' ? 'Agent' : t.speaker === 'system' ? 'System' : 'Caller'}</span>
                          {t.text}
                        </div>
                      ))}
                      {!lead.transcript?.length && <p className="text-sm text-ink-3">No transcript captured.</p>}
                    </div>
                  </section>
                </>
              )}

              {tab === 'activity' && (
                <>
                  <section className="space-y-2">
                    <p className="label">Add a note</p>
                    <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on your call?" />
                    <button className="btn btn-primary" disabled={busy || !note.trim()} onClick={addNote}>Save note</button>
                  </section>
                  <section>
                    <p className="label mb-2">Timeline</p>
                    <ol className="space-y-3">
                      {(data?.events ?? []).map((e) => (
                        <li key={e.id} className="text-sm flex gap-3">
                          <span className="text-[11px] text-ink-3 tabular-nums w-[88px] shrink-0 pt-0.5">{fmtIST(e.at)}</span>
                          <span className="leading-relaxed">
                            {e.type === 'stage_change' ? (
                              <>Moved <b>{e.from_stage}</b> → <b>{e.to_stage}</b></>
                            ) : (
                              e.note ?? e.type
                            )}
                            {e.by && <span className="text-ink-3"> · {e.by}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                  {!!lead.step_errors?.length && (
                    <section>
                      <p className="label mb-1.5">Steps that failed</p>
                      <ul className="text-xs text-ink-2 space-y-1">
                        {lead.step_errors.map((s: any, i: number) => <li key={i}>{s.step}: {s.error}</li>)}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="kv">
      <dt className="label">{k}</dt>
      <dd className={cn('text-sm', !v && 'text-ink-3')}>{v || 'Not said'}</dd>
    </div>
  );
}
