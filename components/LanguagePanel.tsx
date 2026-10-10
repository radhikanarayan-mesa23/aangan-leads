'use client';

import { Donut, DonutLegend, type DonutSlice } from './Donut';
import { cn } from '@/lib/utils';

/**
 * Which language callers open in, and whether it changes what we win.
 *
 * For a Pune studio this is a staffing question as much as a product one: if
 * half the callers open in Marathi, that is who the designers ringing them back
 * need to be comfortable with.
 */
export function LanguagePanel({
  slices,
  known,
  switched,
  switchedShare,
  confident,
  caveat,
}: {
  slices: { key: string; label: string; leads: number; won: number; winRate: number | null }[];
  known: number;
  switched: number;
  switchedShare: number;
  confident: boolean;
  caveat: string | null;
}) {
  const donut: DonutSlice[] = slices.map((s) => ({ key: s.key, label: s.label, value: s.leads }));

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">What language callers use</p>
          <p className="text-xs text-ink-3">The language they opened in, and whether it changes the outcome</p>
        </div>
        {!confident && <span className="chip fit-close shrink-0">early days</span>}
      </div>

      {known === 0 ? (
        <p className="text-sm text-ink-3 py-6">No languages recorded yet — this fills in as calls are graded.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-[150px_minmax(0,1fr)] gap-4 items-center">
            <Donut slices={donut} centreValue={String(known)} centreLabel="callers" height={150} />
            <DonutLegend slices={donut} />
          </div>

          <div className="mt-3 pt-3 border-t border-line">
            <p className="text-sm">
              <b className="tabular-nums">{Math.round(switchedShare * 100)}%</b> of callers switched language mid-call
              <span className="text-ink-3"> ({switched} of {known})</span>
            </p>
            <p className="text-[11px] text-ink-3 mt-0.5">
              The agent follows them — speech recognition runs multilingual and the model switches with the caller.
            </p>
          </div>

          {slices.some((s) => s.winRate != null) && (
            <table className="mt-3 w-full text-[12px]">
              <thead>
                <tr className="text-ink-3 text-left">
                  <th className="font-medium pb-1.5">Language</th>
                  <th className="font-medium pb-1.5 text-right">Callers</th>
                  <th className="font-medium pb-1.5 text-right">Won</th>
                  <th className="font-medium pb-1.5 text-right">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((s) => (
                  <tr key={s.key} className="border-t border-line">
                    <td className="py-1.5">{s.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.leads}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.won || <span className="text-ink-3">—</span>}</td>
                    <td className={cn('py-1.5 text-right tabular-nums', s.winRate != null && s.winRate >= 0.5 && 'font-medium')}>
                      {s.winRate == null ? <span className="text-ink-3">—</span> : `${Math.round(s.winRate * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {caveat && <p className="mt-3 text-[11px] text-ink-3 border-t border-line pt-2.5">{caveat}</p>}
        </>
      )}
    </section>
  );
}
