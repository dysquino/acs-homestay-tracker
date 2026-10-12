import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/cn";

/**
 * A page header's action button, so a row of them looks like one set. On a
 * phone they share the row as equal tiles — icon above a short label — since
 * three full-width labels wrapped onto two uneven lines; from `sm` up each is
 * a normal icon + label button. Use inside <HeaderActions>.
 *
 * A page with one main action (Add expense, Add cleaning) uses `primary`:
 * the same button, filled, spanning the row on a phone with its icon beside
 * the label — it has the width, so it doesn't need the tile shape.
 */
export function HeaderAction({
  icon: Icon,
  label,
  shortLabel,
  onClick,
  primary,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  /** Shown on phones, where the tiles are narrow. */
  shortLabel?: string;
  onClick: () => void;
  /** The page's main action: filled brand colour, icon beside the label. */
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center justify-center rounded-md font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        "sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-sm sm:whitespace-nowrap",
        primary
          ? "min-h-11 gap-1.5 bg-brand-700 px-3.5 py-2.5 text-sm text-white hover:bg-brand-800 focus-visible:outline-brand-700 sm:min-h-0"
          : "flex-col gap-1 bg-white px-2 py-2.5 text-xs text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 focus-visible:outline-slate-400 sm:flex-row",
      )}
    >
      <Icon className={cn("shrink-0 sm:h-4 sm:w-4", primary ? "h-4 w-4 text-white" : "h-5 w-5 text-slate-500")} />
      <span className="truncate sm:hidden">{shortLabel ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Lays out HeaderActions: equal columns on a phone, a row from `sm` up. */
export function HeaderActions({ children, count }: { children: React.ReactNode; count: 1 | 2 | 3 | 4 }) {
  const cols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[count];
  return <div className={cn("grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap", cols)}>{children}</div>;
}
