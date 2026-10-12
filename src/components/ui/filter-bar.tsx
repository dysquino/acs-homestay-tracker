"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ChevronRightIcon, FilterIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * The filter strip at the top of a table card. One flowing row that spans the
 * card's full width — each control grows to share the space, and wraps to a
 * new row only when the card is too narrow — so filters never clump on the
 * left with dead space beside them. Give a control `className="min-w-36 flex-1"`
 * (via <Field>) to take part in that sharing.
 *
 * On a phone the controls unfolded into five rows of dropdowns before the
 * list even started, so below `sm` they fold away behind one "Filters" button
 * showing how many are on (`activeCount`), with Clear beside it. From `sm` up
 * the row is always shown, as before.
 *
 * `period` (a PeriodPicker) shares the phone's summary row — period on the
 * left, Filters on the right — and leads the row from `sm` up, so the list
 * starts one row sooner.
 */
export function FilterBar({
  children,
  filtersActive,
  activeCount,
  onClear,
  period,
}: {
  children: ReactNode;
  period?: ReactNode;
  filtersActive: boolean;
  /** How many filters are on — shown on the phone's "Filters" button. */
  activeCount?: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = activeCount ?? (filtersActive ? 1 : 0);

  return (
    <div className="border-b border-slate-100 bg-slate-50/60">
      {/* Phone only: the folded-away summary row. */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 sm:hidden">
        {period ? <div className="-ml-1.5 min-w-0 text-sm">{period}</div> : null}
        <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-slate-700"
        >
          <FilterIcon className="h-4 w-4 text-slate-500" />
          Filters
          {count > 0 ? (
            <span className="rounded-full bg-brand-700 px-1.5 text-[11px] leading-5 font-semibold text-white">
              {count}
            </span>
          ) : null}
          <ChevronRightIcon className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-90")} />
        </button>
        {filtersActive ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        ) : null}
        </div>
      </div>

      <div
        id={panelId}
        className={cn(
          "flex-wrap items-end gap-x-3 gap-y-3 px-4 py-3 sm:flex sm:px-5",
          open ? "flex border-t border-slate-100 sm:border-t-0" : "hidden",
        )}
      >
        {period ? (
          <div className="hidden shrink-0 sm:block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Period</span>
            <div className="-ml-1.5 flex min-h-10 items-center text-sm">{period}</div>
          </div>
        ) : null}
        {children}
        {/* Always rendered (just disabled) so the row doesn't reflow when a
            filter is toggled. On a phone, Clear lives in the summary row. */}
        {/* Hidden via a wrapper: the Button's own inline-flex would beat a
            plain "hidden" class on it. */}
        <span className="mb-1 hidden shrink-0 sm:inline-flex">
          <Button size="sm" variant="ghost" disabled={!filtersActive} onClick={onClear}>
            Clear filters
          </Button>
        </span>
      </div>
    </div>
  );
}
