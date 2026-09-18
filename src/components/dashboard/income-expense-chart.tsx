"use client";

import { useId, useState } from "react";

import { formatCurrency } from "@/lib/format";

/**
 * Income vs. expenses over the last several months.
 *
 * Two named series being compared over time -> multi-line chart with
 * categorical color (per the dataviz skill's form heuristic: "tell distinct
 * series apart" -> categorical, "trend over time" -> line). Colors are the
 * validated default palette's slot 1 (blue) and slot 2 (orange), used in
 * that fixed order — not status colors, since "up" isn't inherently
 * good/bad here, it's just which series.
 */

const INCOME_COLOR = "#2a78d6"; // categorical slot 1
const EXPENSE_COLOR = "#eb6834"; // categorical slot 2
const MUTED = "#898781";
const GRIDLINE = "#e1e0d9";
const TEXT_SECONDARY = "#52514e";

export type MonthPoint = {
  /** e.g. "2026-04-01" */
  month: string;
  label: string;
  income: number;
  expenses: number;
};

const WIDTH = 640;
const HEIGHT = 130;
const PAD = { top: 10, right: 12, bottom: 22, left: 44 };

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  // Tighter step table (adds 2.5) so the axis max sits closer to the
  // actual data max instead of leaving half the chart empty — e.g. a
  // max of ~24,000 now rounds to 25,000, not 50,000.
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function IncomeExpenseChart({ data }: { data: MonthPoint[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const maxValue = niceMax(
    Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses))),
  );

  const x = (i: number) =>
    PAD.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / maxValue) * plotH;

  const linePath = (key: "income" | "expenses") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d[key])}`).join(" ");

  const gridSteps = [0, 0.5, 1];
  const hovered = hover !== null ? data[hover] : null;

  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    // `rect` is the hit-area <rect>'s own bounding box, which spans only
    // the plot width (PAD.left to PAD.left + plotW) — not the full SVG
    // viewBox width — so the fraction scales against plotW, offset by
    // PAD.left, to land back in the same coordinate space as x(i).
    const rect = e.currentTarget.getBoundingClientRect();
    const px = PAD.left + ((e.clientX - rect.left) / rect.width) * plotW;
    let nearest = 0;
    let best = Infinity;
    data.forEach((_, i) => {
      const d = Math.abs(x(i) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  }

  if (data.length === 0) return null;

  return (
    <div>
      {/* Legend — line-key swatches, not boxes; text stays in ink, never
          the series color, per marks-and-anatomy.md. */}
      <div className="mb-1 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <svg width="14" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="14" y2="4" stroke={INCOME_COLOR} strokeWidth={2} />
          </svg>
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="14" y2="4" stroke={EXPENSE_COLOR} strokeWidth={2} />
          </svg>
          Expenses
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label="Income and expenses by month"
        >
          <defs>
            <clipPath id={gradientId}>
              <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* Gridlines — hairline, recessive, solid */}
          {gridSteps.map((s) => {
            const gy = PAD.top + plotH - s * plotH;
            return (
              <g key={s}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={gy}
                  y2={gy}
                  stroke={GRIDLINE}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={gy}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill={MUTED}
                >
                  {formatCurrency(maxValue * s)}
                </text>
              </g>
            );
          })}

          {/* X labels */}
          {data.map((d, i) => (
            <text
              key={d.month}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
            >
              {d.label}
            </text>
          ))}

          {/* Crosshair */}
          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={MUTED}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          ) : null}

          {/* Lines */}
          <path
            d={linePath("income")}
            fill="none"
            stroke={INCOME_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${gradientId})`}
          />
          <path
            d={linePath("expenses")}
            fill="none"
            stroke={EXPENSE_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${gradientId})`}
          />

          {/* End markers with a surface ring */}
          {(["income", "expenses"] as const).map((key) => {
            const last = data[data.length - 1];
            const color = key === "income" ? INCOME_COLOR : EXPENSE_COLOR;
            return (
              <g key={key}>
                <circle
                  cx={x(data.length - 1)}
                  cy={y(last[key])}
                  r={6}
                  fill="#fff"
                />
                <circle
                  cx={x(data.length - 1)}
                  cy={y(last[key])}
                  r={4}
                  fill={color}
                />
              </g>
            );
          })}

          {/* Hover dots on every series at the hovered month */}
          {hovered
            ? (["income", "expenses"] as const).map((key) => (
                <g key={key}>
                  <circle
                    cx={x(hover!)}
                    cy={y(hovered[key])}
                    r={6}
                    fill="#fff"
                  />
                  <circle
                    cx={x(hover!)}
                    cy={y(hovered[key])}
                    r={4}
                    fill={key === "income" ? INCOME_COLOR : EXPENSE_COLOR}
                  />
                </g>
              ))
            : null}

          {/* Transparent hit area for hover — bigger than the marks */}
          <rect
            x={PAD.left}
            y={0}
            width={plotW}
            height={HEIGHT}
            fill="transparent"
            onPointerMove={handlePointer}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {/* Tooltip — one readout listing every series, values lead */}
        {hovered ? (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-md"
            style={{
              left: `${(x(hover!) / WIDTH) * 100}%`,
              transform:
                hover! > data.length / 2
                  ? "translateX(-105%)"
                  : "translateX(5%)",
            }}
          >
            <p className="mb-1 font-medium text-slate-900">{hovered.label}</p>
            <p className="flex items-center gap-1.5 text-slate-600">
              <span
                className="inline-block h-0.5 w-3"
                style={{ backgroundColor: INCOME_COLOR }}
              />
              <span className="font-semibold text-slate-900">
                {formatCurrency(hovered.income)}
              </span>
              income
            </p>
            <p className="flex items-center gap-1.5 text-slate-600">
              <span
                className="inline-block h-0.5 w-3"
                style={{ backgroundColor: EXPENSE_COLOR }}
              />
              <span className="font-semibold text-slate-900">
                {formatCurrency(hovered.expenses)}
              </span>
              expenses
            </p>
          </div>
        ) : null}
      </div>

      {/* Accessible fallback — every value the chart shows is also here */}
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer select-none" style={{ color: TEXT_SECONDARY }}>
          View as table
        </summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 pr-3 font-medium">Month</th>
              <th className="py-1 pr-3 font-medium">Income</th>
              <th className="py-1 font-medium">Expenses</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t border-slate-100">
                <td className="py-1 pr-3">{d.label}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {formatCurrency(d.income)}
                </td>
                <td className="py-1 tabular-nums">
                  {formatCurrency(d.expenses)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
