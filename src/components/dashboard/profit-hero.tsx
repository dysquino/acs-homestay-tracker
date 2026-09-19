import { SOFT_SHADOW } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  formatWhole,
  formatMonth,
  formatShortMonth,
  formatSigned,
} from "@/lib/format";
import type { MonthSummary } from "@/lib/selectors";

/**
 * The one hero figure on the dashboard: profit for the selected month, in
 * the single saturated block (like the reference's card) so the eye lands
 * here first. Below it: the profit trend as an area chart with the selected
 * month marked, and a meter for how much of income the expenses consumed.
 */

type Props = {
  months: MonthSummary[]; // the same window the main chart shows
  selectedIndex: number;
};

export function ProfitHero({ months, selectedIndex }: Props) {
  const current = months[selectedIndex];
  const previous = months[selectedIndex - 1];
  if (!current) return null;

  const delta = profitDelta(current.net, previous?.net);
  const spentShare = current.income > 0 ? current.expenses / current.income : null;
  const overspent = spentShare !== null && spentShare > 1;

  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white sm:p-6",
        SOFT_SHADOW,
      )}
    >
      <p className="text-sm font-medium text-white/90">Profit · {formatMonth(current.month)}</p>

      {/* Hero figure: proportional (not tabular) digits at display size. */}
      <p className="mt-2 text-5xl leading-none font-semibold tracking-tight">
        {formatSigned(current.net)}
      </p>

      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {delta ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-semibold">
            <span aria-hidden="true">{delta.up ? "▲" : "▼"}</span>
            {delta.up ? "Up" : "Down"} {delta.label}
            <span className="sr-only"> compared with {formatMonth(previous.month)}</span>
          </span>
        ) : null}
        {previous ? (
          <span className="text-white/85">vs {formatShortMonth(previous.month)}</span>
        ) : null}
      </div>

      <TrendArea months={months} selectedIndex={selectedIndex} />

      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-white/90">
          <span>
            {spentShare === null
              ? "No income yet this month"
              : overspent
                ? "Spending exceeds income"
                : `Expenses used ${Math.round(spentShare * 100)}% of income`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className={cn("h-full rounded-r-[4px]", overspent ? "bg-red-200" : "bg-white")}
            style={{ width: `${Math.min(spentShare ?? 0, 1) * 100}%` }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div title="Booking payouts, split by the nights stayed in this month. Includes bookings not yet paid and stays still to come.">
            <dt className="text-xs text-white/85">Booked income</dt>
            <dd className="text-lg font-semibold">{formatWhole(current.income)}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/85">Expenses</dt>
            <dd className="text-lg font-semibold">{formatWhole(current.expenses)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function TrendArea({ months, selectedIndex }: Props) {
  const W = 100;
  const H = 100;
  const values = months.map((m) => m.net);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const x = (i: number) => (months.length === 1 ? W / 2 : (i / (months.length - 1)) * W);
  const y = (v: number) => H - ((v - min) / range) * H;

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const area = `${line} L ${x(values.length - 1)} ${H} L ${x(0)} ${H} Z`;
  const cx = (x(selectedIndex) / W) * 100;
  const cy = (y(values[selectedIndex]) / H) * 100;

  return (
    <div className="mt-5" role="img" aria-label={`Profit trend, ${formatMonth(months[0].month)} to ${formatMonth(months[months.length - 1].month)}`}>
      <div className="relative h-20">
        {/* Stretched to fit; non-scaling-stroke keeps the line a true 2px. */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
          <path d={area} fill="white" fillOpacity={0.14} />
          <path
            d={line}
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Marker is HTML so the stretched SVG can't squash it into an ellipse. */}
        <span
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-brand-800"
          style={{ left: `${cx}%`, top: `${cy}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-white/85">
        <span>{formatShortMonth(months[0].month)}</span>
        <span>{formatShortMonth(months[months.length - 1].month)}</span>
      </div>
    </div>
  );
}

/** Change in profit vs the previous month, as a percent when it's meaningful. */
function profitDelta(
  current: number,
  previous: number | undefined,
): { up: boolean; label: string } | null {
  if (previous === undefined || current === previous) return null;
  const up = current > previous;
  if (previous === 0) return { up, label: formatWhole(Math.abs(current)) };
  const pct = (Math.abs(current - previous) / Math.abs(previous)) * 100;
  return { up, label: `${pct >= 100 ? Math.round(pct) : pct.toFixed(1)}%` };
}
