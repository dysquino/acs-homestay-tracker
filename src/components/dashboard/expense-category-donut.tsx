"use client";

import { useState } from "react";

import { formatCurrency } from "@/lib/format";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/types";

/**
 * Expense breakdown by category — a genuine part-to-whole story with a
 * fixed, small category count (<=6), which is exactly the case the dataviz
 * skill allows a pie/donut for ("part-to-whole at a glance only, <= 6
 * segments"). A 2-slice pie (e.g. paid/unpaid) would be an anti-pattern —
 * that's a stat tile instead — but 6 named expense categories genuinely
 * benefit from seeing relative share at a glance.
 */

// Categorical slots 1-6, in EXPENSE_CATEGORIES' fixed declared order —
// validated (including the pie's wrap-around adjacency, slot 6 <-> slot 1)
// via scripts/validate_palette.js. Slots 3/4/5 fall below 3:1 contrast on
// the light surface (documented in palette.md); the legend/table below
// carry the relief this requires — wedge fill is never the only readout.
const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  utility: "#2a78d6",
  dues: "#eb6834",
  repairs: "#1baf7a",
  supplies: "#eda100",
  cleaning: "#e87ba4",
  other: "#008300",
};

const SIZE = 140;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3; // px of surface-color gap between wedges

export type CategorySlice = {
  category: ExpenseCategory;
  amount: number;
};

export function ExpenseCategoryDonut({ data }: { data: CategorySlice[] }) {
  const [hover, setHover] = useState<ExpenseCategory | null>(null);
  const total = data.reduce((s, d) => s + d.amount, 0);
  const nonZero = data.filter((d) => d.amount > 0);

  if (total <= 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-400 sm:px-5">
        No expenses recorded this month.
      </p>
    );
  }

  // Standard SVG donut technique: each wedge is a full-circle <circle>
  // with a dasharray of [its arc length, the remainder], offset by the
  // cumulative arc length of every wedge before it. The whole group is
  // rotated -90deg so the first wedge starts at 12 o'clock instead of
  // the default 3 o'clock. Built with reduce (not a mutated accumulator)
  // so nothing is reassigned across render.
  const { wedges } = nonZero.reduce<{
    cumulative: number;
    wedges: (CategorySlice & { fraction: number; dash: number; offset: number })[];
  }>(
    (acc, d) => {
      const fraction = d.amount / total;
      const dash = Math.max(0, fraction * CIRCUMFERENCE - GAP);
      const offset = -acc.cumulative * CIRCUMFERENCE;
      return {
        cumulative: acc.cumulative + fraction,
        wedges: [...acc.wedges, { ...d, fraction, dash, offset }],
      };
    },
    { cumulative: 0, wedges: [] },
  );

  const hovered = wedges.find((w) => w.category === hover);

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-4 sm:flex-row sm:px-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Expenses by category">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#f1f0ec"
            strokeWidth={STROKE}
          />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {wedges.map((w) => (
              <circle
                key={w.category}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={CATEGORY_COLOR[w.category]}
                strokeWidth={hover === w.category ? STROKE + 4 : STROKE}
                strokeDasharray={`${w.dash} ${CIRCUMFERENCE - w.dash}`}
                strokeDashoffset={w.offset}
                strokeLinecap="butt"
                className="cursor-pointer transition-[stroke-width]"
                onPointerEnter={() => setHover(w.category)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] text-slate-500">
            {hovered ? labelOf(hovered.category) : "Total"}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {formatCurrency(hovered ? hovered.amount : total)}
          </p>
          {hovered ? (
            <p className="text-[10px] text-slate-400">
              {Math.round(hovered.fraction * 100)}%
            </p>
          ) : null}
        </div>
      </div>

      {/* Legend — line-key swatches + amounts, always visible (never rely
          on hover or wedge-fill contrast alone). */}
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-1">
        {nonZero.map((d) => (
          <li
            key={d.category}
            className="flex cursor-pointer items-center gap-1.5"
            onPointerEnter={() => setHover(d.category)}
            onPointerLeave={() => setHover(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[d.category] }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-600">
              {labelOf(d.category)}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">
              {formatCurrency(d.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelOf(category: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
