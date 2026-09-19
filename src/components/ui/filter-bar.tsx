import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

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

/** From / to date pair; the two inputs split the field's width evenly. */
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
    <div className="flex min-w-72 flex-[2] items-end gap-2">
      <Field label="From" className="flex-1">
        {(id) => <Input id={id} type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />}
      </Field>
      <span className="pb-2.5 text-xs text-slate-400">to</span>
      <Field label="To" className="flex-1">
        {(id) => <Input id={id} type="date" value={to} onChange={(e) => onToChange(e.target.value)} />}
      </Field>
    </div>
  );
}
