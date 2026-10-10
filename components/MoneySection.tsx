'use client';

import { Donut, DonutLegend, type DonutSlice } from './Donut';
import { inr } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import type { Breakdown } from '@/lib/revenue';

/**
 * The rest of the dashboard is about leads. This is about money — which work
 * Nikhil actually wins, and what each kind is worth.
 *
 * Every panel states its own confidence. A donut drawn from two won deals looks
 * authoritative and means nothing, so below the threshold we say so rather than
 * drawing a shape that invites a wrong conclusion.
 */
export function MoneyPanel({
  title,
  note,
  breakdown,
}: {
  title: string;
  note: string;
  breakdown: Breakdown;
}) {
  const slices: DonutSlice[] = breakdown.slices.map((s) => ({ key: s.key, label: s.label, value: s.revenue }));
  const hasRevenue = breakdown.total > 0;

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-ink-3">{note}</p>
        </div>
        {!breakdown.confident && <span className="chip fit-close shrink-0">early days</span>}
      </div>

      {hasRevenue ? (
        <div className="grid sm:grid-cols-[170px_minmax(0,1fr)] gap-4 items-center">
          <Donut
            slices={slices}
            centreValue={inr(breakdown.total)}
            centreLabel="won"
            money
            height={170}
          />
          <DonutLegend slices={slices} money />
        </div>
      ) : (
        <p className="text-sm text-ink-3 py-6">{breakdown.caveat}</p>
      )}

      {hasRevenue && breakdown.caveat && (
        <p className="mt-3 text-[11px] text-ink-3 border-t border-line pt-2.5">{breakdown.caveat}</p>
      )}

      {/* The part a revenue donut hides: what we win, not just what pays. */}
      {breakdown.slices.some((s) => s.winRate != null) && (
        <table className="mt-3 w-full text-[12px]">
          <thead>
            <tr className="text-ink-3 text-left">
              <th className="font-medium pb-1.5">Type</th>
              <th className="font-medium pb-1.5 text-right">Enquiries</th>
              <th className="font-medium pb-1.5 text-right">Won</th>
              <th className="font-medium pb-1.5 text-right">Avg value</th>
              <th className="font-medium pb-1.5 text-right">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.slices.map((s) => (
              <tr key={s.key} className="border-t border-line">
                <td className="py-1.5">{s.label}</td>
                <td className="py-1.5 text-right tabular-nums">{s.leads}</td>
                <td className="py-1.5 text-right tabular-nums">{s.won || <span className="text-ink-3">—</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{s.avgValue ? inr(s.avgValue) : <span className="text-ink-3">—</span>}</td>
                <td className={cn('py-1.5 text-right tabular-nums', s.winRate != null && s.winRate >= 0.5 && 'font-medium')}>
                  {s.winRate == null ? <span className="text-ink-3">—</span> : `${Math.round(s.winRate * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Did answering the phone pay for itself? */
export function ReturnPanel({
  spend,
  revenue,
  wonCount,
  perRupee,
  costPerWon,
  confident,
}: {
  spend: number;
  revenue: number;
  wonCount: number;
  perRupee: number | null;
  costPerWon: number | null;
  confident: boolean;
}) {
  return (
    <section className="hero px-5 py-5 sm:px-6">
      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: 'var(--blue-300)' }}>
        Return on answering the phone
      </p>

      {confident && perRupee != null ? (
        <>
          <p className="mt-3 text-[30px] sm:text-[36px] font-semibold tracking-[-0.03em] leading-none text-white tabular-nums">
            ₹{Math.round(perRupee).toLocaleString('en-IN')}
            <span className="text-[16px] font-normal" style={{ color: 'rgba(222,231,255,0.7)' }}> back per ₹1 spent</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(222,231,255,0.72)' }}>
            {inr(revenue)} won from {wonCount} project{wonCount > 1 ? 's' : ''}, against {inr(Math.round(spend))} spent
            answering and grading every call — including the ones that went nowhere.
          </p>
          {costPerWon != null && (
            <p className="mt-1 text-[12px]" style={{ color: 'rgba(222,231,255,0.5)' }}>
              {inr(Math.round(costPerWon))} of AI cost per project won.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm" style={{ color: 'rgba(222,231,255,0.72)' }}>
          {inr(Math.round(spend))} spent so far. This fills in once the first project closes.
        </p>
      )}
    </section>
  );
}
