"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { ChevronRightIcon, FilterIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { endOfMonth } from "@/lib/dates";

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
 */
export function FilterBar({
  children,
  filtersActive,
  activeCount,
  onClear,
}: {
  children: ReactNode;
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

      <div
        id={panelId}
        className={cn(
          "flex-wrap items-end gap-x-3 gap-y-3 px-4 py-3 sm:flex sm:px-5",
          open ? "flex border-t border-slate-100 sm:border-t-0" : "hidden",
        )}
      >
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

/**
 * From / to by month and year — the tables are browsed by month, so picking
 * exact days was more precision than anyone needed. The values handed back
 * are still plain dates, so the pages' filtering is unchanged: `from` is the
 * 1st of its month and `to` the last day of its month.
 *
 * Plain selects rather than <input type="month">, which desktop Safari and
 * Firefox don't support. Choosing only a year covers the whole year (From →
 * January, To → December); choosing only a month assumes the current year.
 */
export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-72 flex-[2] flex-wrap items-end gap-x-3 gap-y-3">
      <MonthYearField label="From" edge="start" value={from} onChange={onFromChange} />
      <MonthYearField label="To" edge="end" value={to} onChange={onToChange} />
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthYearField({
  label,
  edge,
  value,
  onChange,
}: {
  label: string;
  /** "start" → the 1st of the month; "end" → its last day. */
  edge: "start" | "end";
  value: string;
  onChange: (value: string) => void;
}) {
  const year = value.slice(0, 4);
  const month = value.slice(5, 7);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear + 2 - i));
  if (year && !years.includes(year)) years.push(year);

  function emit(y: string, m: string) {
    if (!y || !m) return onChange("");
    onChange(edge === "start" ? `${y}-${m}-01` : endOfMonth(`${y}-${m}-01`));
  }

  return (
    <Field label={label} className="min-w-40 flex-1">
      {(id) => (
        <div className="flex gap-2">
          <Select
            id={id}
            aria-label={`${label} month`}
            value={month}
            onChange={(e) => {
              const m = e.target.value;
              emit(m ? year || String(thisYear) : "", m);
            }}
            className="min-w-0 flex-1"
          >
            <option value="">Month</option>
            {MONTHS.map((name, i) => {
              const m = String(i + 1).padStart(2, "0");
              return (
                <option key={m} value={m}>
                  {name}
                </option>
              );
            })}
          </Select>
          <Select
            aria-label={`${label} year`}
            value={year}
            onChange={(e) => {
              const y = e.target.value;
              emit(y, y ? month || (edge === "start" ? "01" : "12") : "");
            }}
            className="min-w-0 flex-1"
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Field>
  );
}
