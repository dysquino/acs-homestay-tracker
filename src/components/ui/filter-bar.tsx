import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { endOfMonth } from "@/lib/dates";

/**
 * The filter strip at the top of a table card. One flowing row that spans the
 * card's full width — each control grows to share the space, and wraps to a
 * new row only when the card is too narrow — so filters never clump on the
 * left with dead space beside them. Give a control `className="min-w-36 flex-1"`
 * (via <Field>) to take part in that sharing.
 */
export function FilterBar({
  children,
  filtersActive,
  onClear,
}: {
  children: ReactNode;
  filtersActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
      {children}
      {/* Always rendered (just disabled) so the row doesn't reflow when a
          filter is toggled. */}
      <Button size="sm" variant="ghost" className="mb-1 shrink-0" disabled={!filtersActive} onClick={onClear}>
        Clear filters
      </Button>
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
