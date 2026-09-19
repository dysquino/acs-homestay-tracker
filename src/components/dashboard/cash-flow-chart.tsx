"use client";

import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { ReceiptIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import {
  formatCompactCurrency,
  formatWhole,
  formatMonth,
  formatShortMonth,
  formatSigned,
} from "@/lib/format";
import type { MonthSummary } from "@/lib/selectors";
import type { ISODate } from "@/lib/types";

/**
 * Income vs expenses per month — two series on ONE shared axis (never dual
 * axis). The story is "how does the selected month compare?", so this uses
 * the emphasis pattern: the selected month carries the deep step of each
 * hue, every other month recedes to a lighter step of the same hue. Colour
 * follows the entity (income = brand amber, expenses = blue), never rank.
 *
 * Amber #d97706/#b45309 vs blue #2a78d6/#256abf validated with
 * scripts/validate_palette.js: worst adjacent CVD ΔE 26+, normal-vision 30+.
 */

const INCOME = { deep: "#b45309", light: "#f2b872", hover: "#e79a3e" };
const EXPENSES = { deep: "#256abf", light: "#86b6ef", hover: "#5598e7" };

const HEADROOM = 32; // px above the tallest bar, for the profit callout
const PLOT_HEIGHT = 256; // includes HEADROOM; the x-axis band sits below it

export type ChartRange = 6 | 12;

type Props = {
  months: MonthSummary[];
  selected: ISODate;
  onSelect: (month: ISODate) => void;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
};

export function CashFlowChart({
  months,
  selected,
  onSelect,
  range,
  onRangeChange,
}: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const { top, ticks } = niceScale(
    Math.max(...months.flatMap((m) => [m.income, m.expenses]), 0),
  );
  const first = months[0]?.month;
  const last = months[months.length - 1]?.month;
  const allZero = months.every((m) => m.income === 0 && m.expenses === 0);

  return (
    <Card className="h-full">
      <CardHeader
        icon={ReceiptIcon}
        title="Income vs expenses"
        description={first && last ? `${formatMonth(first)} – ${formatMonth(last)}` : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Months shown"
              value={range}
              onChange={onRangeChange}
              options={[
                { value: 6, label: "6 mo" },
                { value: 12, label: "12 mo" },
              ]}
            />
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          </div>
        }
      />

      <div className="px-4 pt-2 pb-5 sm:px-5">
        <ul className="mb-2 flex items-center gap-4 text-xs text-slate-600">
          <LegendKey color={INCOME.deep} label="Booked income" />
          <LegendKey color={EXPENSES.deep} label="Expenses" />
          <li className="ml-auto hidden text-slate-400 sm:block">
            Select a month to update the dashboard
          </li>
        </ul>

        {view === "table" ? (
          <MonthTable months={months} selected={selected} />
        ) : allZero ? (
          <p className="py-16 text-center text-sm text-slate-400">
            No income or expenses in this period.
          </p>
        ) : (
          <div className="grid grid-cols-[2.75rem_1fr]" style={{ gridTemplateRows: `${PLOT_HEIGHT}px auto` }}>
            {/* Y axis — ticks carry the values that aren't directly labelled. */}
            <div className="relative">
              <div className="absolute inset-x-0 bottom-0" style={{ top: HEADROOM }}>
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute right-2 translate-y-1/2 text-[11px] tabular-nums text-slate-400"
                    style={{ bottom: `${(t / top) * 100}%` }}
                  >
                    {t === 0 ? "0" : formatCompactCurrency(t)}
                  </span>
                ))}
              </div>
            </div>

            {/* Plot */}
            <div className="relative">
              <div className="absolute inset-x-0 bottom-0" style={{ top: HEADROOM }}>
                {ticks.map((t) => (
                  <div
                    key={t}
                    className={cn(
                      "absolute inset-x-0 h-px",
                      t === 0 ? "bg-slate-300" : "bg-slate-100",
                    )}
                    style={{ bottom: `${(t / top) * 100}%` }}
                  />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex" style={{ top: 0 }}>
                {months.map((m, i) => (
                  <MonthColumn
                    key={m.month}
                    m={m}
                    top={top}
                    isSelected={m.month === selected}
                    align={i < 2 ? "start" : i > months.length - 3 ? "end" : "center"}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>

            {/* X axis band — part of the fixed height budget, never clipped. */}
            <div />
            <div className="flex pt-2">
              {months.map((m) => (
                <span
                  key={m.month}
                  className={cn(
                    "flex-1 text-center text-[11px]",
                    m.month === selected ? "font-semibold text-slate-900" : "text-slate-500",
                  )}
                >
                  {formatShortMonth(m.month)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function MonthColumn({
  m,
  top,
  isSelected,
  align,
  onSelect,
}: {
  m: MonthSummary;
  top: number;
  isSelected: boolean;
  align: "start" | "center" | "end";
  onSelect: (month: ISODate) => void;
}) {
  const tallest = Math.max(m.income, m.expenses);
  // The bars live in the drawing area (below the headroom); percent heights
  // are relative to it, so the callout can sit above the tallest bar.
  const drawing = PLOT_HEIGHT - HEADROOM;

  return (
    <button
      type="button"
      onClick={() => onSelect(m.month)}
      aria-pressed={isSelected}
      aria-label={`${formatMonth(m.month)}: income ${formatWhole(m.income)}, expenses ${formatWhole(m.expenses)}, profit ${formatSigned(m.net)}`}
      className="group relative h-full min-w-0 flex-1 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      {/* Ghost wash on hover / focus — never competes with the selection. */}
      <span
        className={cn(
          "absolute inset-x-0.5 rounded-2xl transition-colors",
          "top-0 bottom-0 group-hover:bg-slate-50 group-focus-visible:bg-slate-50",
        )}
      />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-0.5" style={{ height: drawing }}>
        <Bar value={m.income} top={top} palette={INCOME} emphasised={isSelected} />
        <Bar value={m.expenses} top={top} palette={EXPENSES} emphasised={isSelected} />
      </div>

      {isSelected ? (
        <span
          className={cn(
            "absolute left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white",
            m.net >= 0 ? "bg-slate-900" : "bg-red-700",
          )}
          style={{ bottom: `${(tallest / top) * drawing + 8}px` }}
        >
          {m.net >= 0 ? "+" : "−"}
          {formatCompactCurrency(Math.abs(m.net))}
        </span>
      ) : null}

      {/* Tooltip: values lead, labels follow. Also shown on keyboard focus. */}
      <span
        role="presentation"
        className={cn(
          "pointer-events-none absolute z-20 hidden w-44 -translate-y-full rounded-xl bg-white p-3 text-left text-xs shadow-[0_8px_30px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/5",
          "-top-1 group-hover:block group-focus-visible:block",
          align === "start" && "left-0",
          align === "end" && "right-0",
          align === "center" && "left-1/2 -translate-x-1/2",
        )}
      >
        <span className="mb-1.5 block font-medium text-slate-500">{formatMonth(m.month)}</span>
        <TipRow color={INCOME.deep} label="Booked income" value={formatWhole(m.income)} />
        <TipRow color={EXPENSES.deep} label="Expenses" value={formatWhole(m.expenses)} />
        <span className="mt-1.5 flex items-baseline justify-between border-t border-slate-100 pt-1.5">
          <span className="text-slate-500">Profit</span>
          <span className={cn("font-semibold tabular-nums", m.net >= 0 ? "text-slate-900" : "text-red-700")}>
            {formatSigned(m.net)}
          </span>
        </span>
      </span>
    </button>
  );
}

function Bar({
  value,
  top,
  palette,
  emphasised,
}: {
  value: number;
  top: number;
  palette: { deep: string; light: string; hover: string };
  emphasised: boolean;
}) {
  if (value <= 0) return <span className="w-[min(36%,1.5rem)]" />;
  return (
    <span
      className="relative block w-[min(36%,1.5rem)] rounded-t-[4px] transition-colors"
      style={{
        height: `max(3px, ${(value / top) * 100}%)`,
        backgroundColor: emphasised ? palette.deep : palette.light,
      }}
    >
      {/* Hover lift for the de-emphasised bars. */}
      {emphasised ? null : (
        <span
          className="absolute inset-0 rounded-t-[4px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ backgroundColor: palette.hover }}
        />
      )}
    </span>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2 py-0.5">
      <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </span>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label}
    </li>
  );
}

/** The chart's WCAG-clean twin — every value, no hover required. */
function MonthTable({ months, selected }: { months: MonthSummary[]; selected: ISODate }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-2 pr-4 font-medium">Month</th>
            <th className="py-2 pr-4 text-right font-medium">Income</th>
            <th className="py-2 pr-4 text-right font-medium">Expenses</th>
            <th className="py-2 text-right font-medium">Profit</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr
              key={m.month}
              className={cn("border-t border-slate-100", m.month === selected && "bg-slate-50 font-medium")}
            >
              <td className="py-2 pr-4 text-slate-900">{formatMonth(m.month)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{formatWhole(m.income)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{formatWhole(m.expenses)}</td>
              <td className={cn("py-2 text-right tabular-nums", m.net < 0 ? "text-red-700" : "text-slate-900")}>
                {formatSigned(m.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            o.value === value
              ? "bg-brand-700 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Round the axis to clean numbers: 0 / 25K / 50K … */
function niceScale(max: number, targetTicks = 4): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0] };
  const raw = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
  return { top, ticks };
}
