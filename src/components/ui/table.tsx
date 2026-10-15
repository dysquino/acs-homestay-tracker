import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { ChevronRightIcon, EditIcon, EyeIcon, TrashIcon } from "@/components/ui/icons";

/**
 * Wraps a <Table>, shown only on wide (xl) screens. Below that — phones,
 * tablets, and a laptop with the sidebar open — the multi-column tables got
 * crowded (names cut off, the payout column pushed out of view), so those
 * screens get a <CardList> of <CompactRow>s instead: just enough to recognise
 * a row, with the rest in a details sheet one tap away. Every table in this
 * app has a CardList counterpart; see bookings/expenses/cleaning.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="hidden overflow-x-auto xl:block">
      <div className="inline-block min-w-full align-middle">{children}</div>
    </div>
  );
}

/** Counterpart to <TableWrap>/<Table> below xl — a list of <CompactRow>s. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-slate-100 xl:hidden">{children}</ul>;
}

/**
 * One tappable row of a <CardList>: the title (up to two lines, never cut to
 * a few letters), a subtitle, the amount, and a tag or two. Tapping anywhere
 * opens the row's details — the title is a real button stretched over the
 * whole row, so it's keyboard- and screen-reader-friendly. `action` is a
 * quick action that stays in the row (e.g. "Mark paid"); it sits above the
 * stretched button so tapping it doesn't also open the details.
 */
export function CompactRow({
  title,
  subtitle,
  amount,
  tags,
  action,
  onOpen,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  amount: ReactNode;
  tags?: ReactNode;
  action?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li className="relative flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="line-clamp-2 text-left font-medium text-slate-900 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-600 focus-visible:after:ring-inset"
        >
          {title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{subtitle}</span>
          {tags}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold whitespace-nowrap text-slate-900 tabular-nums">{amount}</span>
        {action ? <div className="relative z-10">{action}</div> : null}
      </div>
      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-300" />
    </li>
  );
}

/**
 * A group heading inside a <CardList> (a day, a month…): what the group is,
 * how many rows, and their total. Pinned while you scroll through its group —
 * just under the sticky top bar (4rem) below lg, at the very top from lg up.
 * The list's Card must use overflow-clip, not -hidden, or it won't pin.
 * Leave out `amount` for a one-row group: the row already shows it.
 */
export function GroupHeading({ title, detail, amount }: { title: ReactNode; detail: ReactNode; amount?: ReactNode }) {
  return (
    <li className="sticky top-16 z-10 flex items-baseline justify-between gap-3 bg-slate-50/95 px-4 py-1.5 text-xs text-slate-600 backdrop-blur lg:top-0">
      <span>
        <span className="font-semibold text-slate-900">{title}</span> · {detail}
      </span>
      {amount ? <span className="font-semibold text-slate-900 tabular-nums">{amount}</span> : null}
    </li>
  );
}

/** The main cell of a desktop table row, as a button opening the same details. */
export function RowTitle({ children, onOpen }: { children: ReactNode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left font-medium text-slate-900 hover:text-brand-700 hover:underline"
    >
      {children}
    </button>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      {children}
    </table>
  );
}

/** Header row, pinned to the top of the viewport while a long table scrolls. */
export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-slate-50">{children}</tr>
    </thead>
  );
}

/**
 * A data row with alternating shading. When `onOpen` is supplied, clicking the
 * row's non-interactive surface (or pressing Enter/Space while it is focused)
 * opens its detail view. Buttons and links inside the row keep their own action.
 */
export function Tr({
  children,
  onOpen,
  openLabel,
}: {
  children: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const interactiveSelector = "button, a, input, select, textarea, [role='button'], [role='link']";

  return (
    <tr
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? openLabel : undefined}
      onClick={
        onOpen
          ? (event) => {
              if ((event.target as HTMLElement).closest(interactiveSelector)) return;
              onOpen();
            }
          : undefined
      }
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={`odd:bg-white even:bg-slate-50/60 hover:bg-brand-50/40 ${
        onOpen
          ? "cursor-pointer focus-visible:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
          : ""
      }`}
    >
      {children}
    </tr>
  );
}

/**
 * Compact icon-button row actions (View/Edit/Delete), used by every table and
 * card list instead of wordy text buttons — takes less space, reads faster
 * at a glance, and gives cleaner touch targets on mobile cards. `extra` can
 * hold a row-specific action (e.g. cleaning's "Mark paid") placed before it.
 */
export function RowActions({
  onView,
  onEdit,
  onDelete,
  extra,
}: {
  onView?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {onView ? (
        <button
          type="button"
          onClick={onView}
          aria-label="View"
          title="View"
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-brand-100 hover:text-brand-800 pointer-coarse:p-2.5"
        >
          <EyeIcon className="h-4 w-4" />
        </button>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit"
          title="Edit"
          className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 pointer-coarse:p-2.5"
        >
          <EditIcon className="h-4 w-4" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        title="Delete"
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-100 hover:text-red-700 pointer-coarse:p-2.5"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
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
        "px-3 py-2.5 text-slate-700 align-top whitespace-nowrap",
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
