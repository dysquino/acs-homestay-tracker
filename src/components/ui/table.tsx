import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Wraps a <Table>, hidden below `sm` in favor of a <CardList> — dense
 * multi-column tables don't shrink to phone width usefully even with
 * horizontal scroll, so narrow screens get a stacked-card layout instead.
 * Every table in this app has a CardList counterpart; see bookings/
 * expenses/cleaning pages.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 hidden overflow-x-auto sm:mx-0 sm:block">
      <div className="inline-block min-w-full align-middle">{children}</div>
    </div>
  );
}

/** Mobile counterpart to <TableWrap>/<Table> — a stacked list of <CardRow>s. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-slate-100 sm:hidden">{children}</ul>;
}

export function CardRow({ children }: { children: ReactNode }) {
  return <li className="p-4">{children}</li>;
}

/** A label/value pair within a CardRow, for secondary details. */
export function CardField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-700">{children}</span>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      {children}
    </table>
  );
}

export function Th({
  children,
  align = "left",
  className,
  onClick,
  sort,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  onClick?: () => void;
  sort?: "asc" | "desc" | null;
}) {
  const base = cn(
    "px-3 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap",
    align === "right" && "text-right",
    align === "center" && "text-center",
    align === "left" && "text-left",
    className,
  );

  if (!onClick) return <th className={base}>{children}</th>;

  return (
    <th className={cn(base, "p-0")} aria-sort={ariaSort(sort)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-1 px-3 py-2 hover:text-slate-900",
          align === "right" && "justify-end",
          align === "center" && "justify-center",
        )}
      >
        {children}
        <span className="text-[10px] text-slate-400">
          {sort === "asc" ? "▲" : sort === "desc" ? "▼" : "↕"}
        </span>
      </button>
    </th>
  );
}

function ariaSort(sort?: "asc" | "desc" | null) {
  if (sort === "asc") return "ascending" as const;
  if (sort === "desc") return "descending" as const;
  return "none" as const;
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 text-slate-700 align-top",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {message ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          {message}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
