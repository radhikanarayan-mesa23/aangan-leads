'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { STAGES, GRADE_ORDER, type Stage } from '@/lib/stages';
import { GradeChip, FitChip } from './Chips';
import { LeadDetail } from './LeadDetail';
import { cn, ageLabel, initials } from '@/lib/utils';
import { humanScope } from '@/lib/telegram';
import { nextAction, URGENCY_RANK, URGENCY_STYLE } from '@/lib/next-action';
import { fmtIST } from '@/lib/time';
import type { BoardLead } from '@/lib/view';

type Props = {
  leads: BoardLead[];
  users: { email: string; name: string; role: string }[];
  me: { email: string; name: string; role: string };
  openLeadId?: string;
};

export function Board({ leads, users, me, openLeadId }: Props) {
  const router = useRouter();
  const [grade, setGrade] = useState<string>('all');
  const [mine, setMine] = useState(false);
  const [locality, setLocality] = useState('all');
  const [since, setSince] = useState('all');
  const [designer, setDesigner] = useState('all');
  const [openId, setOpenId] = useState<string | undefined>(openLeadId);
  const [dragging, setDragging] = useState<BoardLead | null>(null);
  const [pending, setPending] = useState<Record<string, Stage>>({});
  const [error, setError] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState<string | null>(null);

  const localities = useMemo(
    () => [...new Set(leads.map((l) => l.locality).filter(Boolean) as string[])].sort(),
    [leads]
  );

  const visible = useMemo(() => {
    return leads
      .map((l) => (pending[l.id] ? { ...l, stage: pending[l.id] } : l))
      .filter((l) => (grade === 'all' ? true : l.grade === grade))
      .filter((l) => (mine ? l.assigned_to === me.email : true))
      .filter((l) => (locality === 'all' ? true : l.locality === locality))
      .filter((l) => {
        if (since === 'all') return true;
        const days = since === 'today' ? 1 : Number(since);
        return Date.now() - new Date(l.created_at).getTime() <= days * 86_400_000;
      })
      .filter((l) => (designer === 'all' ? true : l.assigned_to === designer))
      .sort((a, b) => {
        // Urgency first — the board is a worklist, not a filing cabinet.
        const u = URGENCY_RANK[nextAction(a).urgency] - URGENCY_RANK[nextAction(b).urgency];
        if (u !== 0) return u;
        const g = (GRADE_ORDER[a.grade ?? ''] ?? 9) - (GRADE_ORDER[b.grade ?? ''] ?? 9);
        if (g !== 0) return g;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [leads, pending, grade, mine, locality, designer, since, me.email]);

  const byStage = useMemo(() => {
    const map = new Map<Stage, BoardLead[]>();
    for (const s of STAGES) map.set(s, []);
    for (const l of visible) map.get(l.stage as Stage)?.push(l);
    return map;
  }, [visible]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  async function move(lead: BoardLead, to: Stage, extra: { lost_reason?: string; deal_value_inr?: number } = {}) {
    setError(null);
    setPending((p) => ({ ...p, [lead.id]: to }));
    const res = await fetch(`/api/leads/${lead.id}/stage`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: to, ...extra }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'That move did not stick.');
      setJustMoved(null);
      setPending((p) => {
        const next = { ...p };
        delete next[lead.id];
        return next;
      });
      return;
    }
    setJustMoved(lead.id);
    window.setTimeout(() => setJustMoved((id) => (id === lead.id ? null : id)), 800);
    router.refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const to = e.over?.id as Stage | undefined;
    const lead = visible.find((l) => l.id === e.active.id);
    if (!to || !lead || lead.stage === to) return;

    // CLAUDE.md §9 — these two moves need a value before they can happen.
    if (to === 'Not converted') {
      const reason = window.prompt(`Why is ${lead.ticket_no} not converting?`);
      if (!reason?.trim()) return;
      void move(lead, to, { lost_reason: reason.trim() });
      return;
    }
    if (to === 'Proposal sent') {
      const value = window.prompt(`Proposal value for ${lead.ticket_no} (₹):`, String(lead.deal_value_inr ?? ''));
      const num = Number(String(value ?? '').replace(/[^\d]/g, ''));
      if (!num) return;
      void move(lead, to, { deal_value_inr: num });
      return;
    }
    void move(lead, to);
  }

  const open = openId ? leads.find((l) => l.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={grade}
          onChange={setGrade}
          options={[
            { v: 'all', label: `All ${visible.length}` },
            { v: 'HOT', label: 'Hot' },
            { v: 'WARM', label: 'Warm' },
            { v: 'LOW', label: 'Low' },
            { v: 'ESCALATE', label: 'Escalate' },
          ]}
        />
        <button className={cn('btn', mine && 'btn-primary')} onClick={() => setMine((m) => !m)}>
          {mine ? 'Mine' : 'Everyone'}
        </button>
        <select className="input w-auto" value={locality} onChange={(e) => setLocality(e.target.value)}>
          <option value="all">All localities</option>
          {localities.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select className="input w-auto" value={since} onChange={(e) => setSince(e.target.value)}>
          <option value="all">Any date</option>
          <option value="today">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        {me.role === 'owner' && (
          <select className="input w-auto" value={designer} onChange={(e) => setDesigner(e.target.value)}>
            <option value="all">All designers</option>
            {users.filter((u) => u.role === 'designer').map((u) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>
        )}
        {me.role === 'owner' && <DesignerLoad leads={visible} users={users} />}
      </div>

      {error && <p className="text-sm text-[var(--hot)]">{error}</p>}

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragging(visible.find((l) => l.id === e.active.id) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin -mx-4 px-4 sm:-mx-6 sm:px-6">
          {STAGES.map((stage) => (
            <Column key={stage} stage={stage} leads={byStage.get(stage) ?? []} onOpen={setOpenId} justMoved={justMoved} />
          ))}
        </div>
        <DragOverlay>{dragging ? <Card lead={dragging} dragging /> : null}</DragOverlay>
      </DndContext>

      {open && (
        <LeadDetail
          leadId={open.id}
          users={users}
          me={me}
          onClose={() => setOpenId(undefined)}
          onMoved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Column({
  stage,
  leads,
  onOpen,
  justMoved,
}: {
  stage: Stage;
  leads: BoardLead[];
  onOpen: (id: string) => void;
  justMoved?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="w-[270px] shrink-0 flex flex-col">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="text-sm font-medium">{stage}</h2>
        <span
          key={leads.length}
          className="text-xs text-ink-3 tabular-nums animate-fade-up rounded-chip bg-surface-2 px-1.5 min-w-[22px] text-center"
        >
          {leads.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        data-over={isOver}
        className="column-drop flex-1 min-h-[160px] rounded-card p-2 space-y-2 border border-dashed border-transparent"
      >
        {leads.map((l, i) => (
          <Card key={l.id} lead={l} onOpen={onOpen} index={i} justMoved={justMoved === l.id} />
        ))}
        {leads.length === 0 && <p className="text-xs text-ink-3 px-1 py-3">Nothing here.</p>}
      </div>
    </div>
  );
}

function Card({
  lead,
  onOpen,
  dragging,
  index = 0,
  justMoved,
}: {
  lead: BoardLead;
  onOpen?: (id: string) => void;
  dragging?: boolean;
  index?: number;
  justMoved?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, animation: 'none' }
    : // Stagger the entrance down the column, capped so a long column never crawls.
      { animationDelay: `${Math.min(index, 7) * 45}ms` };

  // The whole card is both the drag handle and the open target. dnd-kit's
  // pointer sensor needs 6px of movement before it claims the gesture, so a
  // plain click still falls through to onClick.
  return (
    <article
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen?.(lead.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(lead.id);
        }
      }}
      className={cn(
        'lead-card card p-3 shadow-card cursor-grab active:cursor-grabbing select-none text-left',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-400)]',
        (isDragging || dragging) && 'opacity-95 shadow-pop rotate-[1.2deg] scale-[1.02]',
        justMoved && 'just-moved'
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{lead.caller_name ?? 'Unnamed caller'}</p>
          <p className="text-[11px] text-ink-3 tabular-nums">{lead.ticket_no}</p>
        </div>
        <GradeChip grade={lead.grade} />
      </div>

      <p className="mt-2 text-xs text-ink-2 leading-relaxed">
        {[lead.locality, lead.property_type, humanScope(lead.scope), lead.carpet_area_sqft ? `${lead.carpet_area_sqft} sq ft` : null]
          .filter(Boolean)
          .join(' · ') || 'Details not captured'}
      </p>

      {(() => {
        const na = nextAction(lead);
        return na.urgency === 'done' ? null : (
          <p className={cn('mt-2 chip w-full justify-start', URGENCY_STYLE[na.urgency])}>
            {na.urgency === 'overdue' ? '⚠︎' : na.urgency === 'now' ? '→' : '·'} {na.label}
          </p>
        );
      })()}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <FitChip fit={lead.budget_fit} />
        {lead.booked_at && <span className="chip fit-fits">📅 {fmtIST(lead.booked_at, 'EEE d, h:mma')}</span>}
        {lead.flags?.includes('PRICE_SPOKEN') && <span className="chip fit-below">price spoken</span>}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-3">
        <span>{ageLabel(lead.created_at)} old{lead.call_attempts ? ` · ${lead.call_attempts} call${lead.call_attempts > 1 ? 's' : ''}` : ''}</span>
        {lead.assigned_to ? (
          <span
            className="grid place-items-center size-5 rounded-full bg-surface-2 border text-[10px] font-medium text-ink-2"
            title={lead.assigned_to}
          >
            {initials(lead.assigned_name ?? lead.assigned_to)}
          </span>
        ) : (
          <ClaimButton leadId={lead.id} />
        )}
      </div>
    </article>
  );
}

function ClaimButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  return (
    <button
      className="text-[11px] underline text-ink-2 hover:text-ink"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={async (e) => {
        e.stopPropagation();
        await fetch(`/api/leads/${leadId}/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        router.refresh();
      }}
    >
      Claim
    </button>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-card border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'px-2.5 py-1 text-xs rounded-[7px] transition-colors',
            value === o.v ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Owner-only: how the open work is spread across the team. */
function DesignerLoad({ leads, users }: { leads: BoardLead[]; users: Props['users'] }) {
  const open = leads.filter((l) => !['Converted', 'Completed', 'Not converted'].includes(l.stage));
  return (
    <div className="flex items-center gap-2 text-xs text-ink-2 ml-auto">
      <span className="label">Load</span>
      {users
        .filter((u) => u.role === 'designer')
        .map((u) => (
          <span key={u.email} className="chip fit-unknown">
            {u.name.split(' ')[0]} {open.filter((l) => l.assigned_to === u.email).length}
          </span>
        ))}
      <span className="chip fit-unknown">Unclaimed {open.filter((l) => !l.assigned_to).length}</span>
    </div>
  );
}
