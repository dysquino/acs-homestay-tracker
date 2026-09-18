import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const TONE_COLOR: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "#0f172a", // slate-900
  positive: "#047857", // emerald-700
  negative: "#b91c1c", // red-700
  brand: "#115e59", // brand-800
};

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "brand";
  /** Values over time, oldest first. Renders as a small trend line — the
   * current (last) point in the tile's tone color, the rest in a
   * de-emphasis gray, per the stat-tile contract: value + delta + sparkline. */
  trend?: number[];
};

export function StatTile({ label, value, hint, tone = "neutral", trend }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} color={TONE_COLOR[tone]} />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "positive" && "text-emerald-700",
          tone === "negative" && "text-red-700",
          tone === "brand" && "text-brand-800",
          tone === "neutral" && "text-slate-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const SPARK_W = 56;
const SPARK_H = 20;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * SPARK_W;
    const y = SPARK_H - ((v - min) / range) * SPARK_H;
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="#c3c2b7"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}
