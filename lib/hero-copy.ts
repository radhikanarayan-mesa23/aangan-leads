/**
 * The sentence the dashboard opens with. Lives in lib/ rather than beside the
 * hero component because the owner page is a server component and cannot call
 * into a 'use client' module.
 */
export function heroCopy(k: {
  hotInNew: number;
  awaitingCallback: number;
  escalations: number;
  pricesSpoken: number;
}): { headline: string; sub: string } {
  const bits: string[] = [];
  if (k.hotInNew) bits.push(`${k.hotInNew} hot ${k.hotInNew === 1 ? 'lead is' : 'leads are'} unclaimed`);
  if (k.awaitingCallback) bits.push(`${k.awaitingCallback} ${k.awaitingCallback === 1 ? 'callback is' : 'callbacks are'} owed`);
  const headline = bits.length ? bits.join(', ') : 'Every lead is with a designer';

  const sub = k.escalations
    ? `${k.escalations} existing ${k.escalations === 1 ? 'client needs' : 'clients need'} calling back today. No price has reached a caller.`
    : k.pricesSpoken
      ? `⚠️ ${k.pricesSpoken} ${k.pricesSpoken === 1 ? 'call' : 'calls'} where the agent said a number — check the transcript.`
      : 'No price has reached a caller, and nothing has been dropped without a reason.';

  return { headline: headline + '.', sub };
}
