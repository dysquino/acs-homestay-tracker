"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { startOfMonth, today as getToday } from "@/lib/dates";
import {
  PRESET_LABELS,
  canStep,
  monthRange,
  periodLabel,
  periodRange,
  presetPeriod,
  samePeriod,
  stepPeriod,
  type Period,
  type PresetKey,
} from "@/lib/period";

/**
 * Which stretch of time a list shows, in one row: ◀ October 2026 ▾ ▶.
 * The arrows step a month (or a year); tapping the label opens a sheet of
 * presets — This month, Last 3 months, All time… — with a custom month range
 * at the bottom. Replaces the From/To month-and-year dropdowns, which took
 * four selects (two rows on a phone) for something usually done in one tap.
 */
export function PeriodPicker({
  value,
  onChange,
  presets,
  className,
}: {
  value: Period;
  onChange: (period: Period) => void;
  presets: PresetKey[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const steppable = canStep(value);
  const unit = value.kind === "year" ? "year" : "month";

  const arrow = "rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 pointer-coarse:p-2";
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {steppable ? (
        <button type="button" aria-label={`Previous ${unit}`} onClick={() => onChange(stepPeriod(value, -1))} className={arrow}>
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Showing ${periodLabel(value)}. Change period`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold whitespace-nowrap text-slate-900 hover:bg-slate-100 pointer-coarse:py-2"
      >
        {periodLabel(value)}
        <ChevronDownIcon className="h-3.5 w-3.5 text-slate-500" />
      </button>
      {steppable ? (
        <button type="button" aria-label={`Next ${unit}`} onClick={() => onChange(stepPeriod(value, 1))} className={arrow}>
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      ) : null}

      {open ? (
        <PeriodSheet
          value={value}
          presets={presets}
          onClose={() => setOpen(false)}
          onPick={(p) => {
            onChange(p);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PeriodSheet({
  value,
  presets,
  onClose,
  onPick,
}: {
  value: Period;
  presets: PresetKey[];
  onClose: () => void;
  onPick: (period: Period) => void;
}) {
  const today = getToday();
  const presetMatch = presets.find((k) => samePeriod(presetPeriod(k, today), value));
  // The custom range starts from what's showing (or this month).
  const { from, to } = periodRange(value, today);
  const [customFrom, setCustomFrom] = useState(startOfMonth(from ?? today));
  const [customTo, setCustomTo] = useState(startOfMonth(to ?? from ?? today));

  return (
    <Modal open onClose={onClose} title="Show" description="Pick a period, or step months with the arrows.">
      <ul className="-mx-2 grid grid-cols-2 gap-1">
        {presets.map((key) => {
          const active = key === presetMatch;
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onPick(presetPeriod(key, today))}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm",
                  active ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-700 hover:bg-slate-50",
                )}
              >
                {PRESET_LABELS[key]}
                {active ? <CheckIcon className="h-4 w-4 shrink-0" /> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Custom range</p>
        <div className="grid gap-3">
          <MonthYearField label="From" value={customFrom} onChange={setCustomFrom} />
          <MonthYearField label="To" value={customTo} onChange={setCustomTo} />
        </div>
        <Button variant="primary" className="mt-3 w-full" onClick={() => onPick(monthRange(customFrom, customTo))}>
          Show {periodLabel(monthRange(customFrom, customTo))}
        </Button>
      </div>
    </Modal>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A month as two selects — plain selects rather than <input type="month">,
 * which desktop Safari and Firefox don't support. `value` is the month's 1st.
 */
function MonthYearField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const year = value.slice(0, 4);
  const month = value.slice(5, 7);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear + 2 - i));
  if (!years.includes(year)) years.push(year);

  return (
    <Field label={label}>
      {(id) => (
        <div className="flex gap-2">
          <Select
            id={id}
            aria-label={`${label} month`}
            value={month}
            onChange={(e) => onChange(`${year}-${e.target.value}-01`)}
            className="min-w-0 flex-1"
          >
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
            onChange={(e) => onChange(`${e.target.value}-${month}-01`)}
            className="min-w-0 flex-1"
          >
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
