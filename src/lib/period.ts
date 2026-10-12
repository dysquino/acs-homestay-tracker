import { addMonths, endOfMonth, parseISO, startOfMonth } from "./dates";
import type { ISODate } from "./types";

/**
 * The time span a list is showing — picked with the PeriodPicker (arrows to
 * step, a sheet of presets, or a custom month range). Pure, so the pages and
 * the tests share one definition of what each period covers.
 */
export type Period =
  | { kind: "month"; month: ISODate } // the 1st of the month
  | { kind: "year"; year: number }
  | { kind: "range"; from: ISODate; to: ISODate } // 1st of a month → last day of a month
  | { kind: "upcoming" } // bookings not yet checked out
  | { kind: "all" };

export type PresetKey =
  | "upcoming"
  | "thisMonth"
  | "nextMonth"
  | "lastMonth"
  | "last3"
  | "thisYear"
  | "lastYear"
  | "all";

export const PRESET_LABELS: Record<PresetKey, string> = {
  upcoming: "Upcoming",
  thisMonth: "This month",
  nextMonth: "Next month",
  lastMonth: "Last month",
  last3: "Last 3 months",
  thisYear: "This year",
  lastYear: "Last year",
  all: "All time",
};

export function presetPeriod(key: PresetKey, today: ISODate): Period {
  const thisMonth = startOfMonth(today);
  const year = parseISO(today).getFullYear();
  switch (key) {
    case "upcoming":
      return { kind: "upcoming" };
    case "thisMonth":
      return { kind: "month", month: thisMonth };
    case "nextMonth":
      return { kind: "month", month: addMonths(thisMonth, 1) };
    case "lastMonth":
      return { kind: "month", month: addMonths(thisMonth, -1) };
    case "last3":
      return { kind: "range", from: addMonths(thisMonth, -2), to: endOfMonth(thisMonth) };
    case "thisYear":
      return { kind: "year", year };
    case "lastYear":
      return { kind: "year", year: year - 1 };
    case "all":
      return { kind: "all" };
  }
}

export function samePeriod(a: Period, b: Period): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The dates a period covers; `null` means open-ended on that side.
 * "Upcoming" starts today (a stay still in progress counts).
 */
export function periodRange(p: Period, today: ISODate): { from: ISODate | null; to: ISODate | null } {
  switch (p.kind) {
    case "month":
      return { from: p.month, to: endOfMonth(p.month) };
    case "year":
      return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
    case "range":
      return { from: p.from, to: p.to };
    case "upcoming":
      return { from: today, to: null };
    case "all":
      return { from: null, to: null };
  }
}

/** Does a single date fall in the period? (Expenses, cleanings.) */
export function inPeriod(date: ISODate, p: Period, today: ISODate): boolean {
  const { from, to } = periodRange(p, today);
  return (!from || date >= from) && (!to || date <= to);
}

/** Does a stay touch the period? Checking out on its first day doesn't count. */
export function stayInPeriod(checkIn: ISODate, checkOut: ISODate, p: Period, today: ISODate): boolean {
  const { from, to } = periodRange(p, today);
  if (p.kind === "upcoming") return checkOut >= today;
  return (!from || checkOut > from) && (!to || checkIn <= to);
}

const monthYear = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" });
const shortMonth = new Intl.DateTimeFormat("en-PH", { month: "short" });
const shortMonthYear = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric" });

export function periodLabel(p: Period): string {
  switch (p.kind) {
    case "month":
      return monthYear.format(parseISO(p.month));
    case "year":
      return String(p.year);
    case "range": {
      const from = parseISO(p.from);
      const to = parseISO(p.to);
      if (p.from.slice(0, 7) === p.to.slice(0, 7)) return monthYear.format(from);
      return from.getFullYear() === to.getFullYear()
        ? `${shortMonth.format(from)} – ${shortMonthYear.format(to)}`
        : `${shortMonthYear.format(from)} – ${shortMonthYear.format(to)}`;
    }
    case "upcoming":
      return "Upcoming";
    case "all":
      return "All time";
  }
}

/** Months and years step with the arrows; other periods don't. */
export function canStep(p: Period): boolean {
  return p.kind === "month" || p.kind === "year";
}

export function stepPeriod(p: Period, delta: number): Period {
  if (p.kind === "month") return { kind: "month", month: addMonths(p.month, delta) };
  if (p.kind === "year") return { kind: "year", year: p.year + delta };
  return p;
}

/** A custom range from two months (inclusive), in either order; one month → that month. */
export function monthRange(a: ISODate, b: ISODate): Period {
  const [first, last] = a <= b ? [a, b] : [b, a];
  const from = startOfMonth(first);
  if (from === startOfMonth(last)) return { kind: "month", month: from };
  return { kind: "range", from, to: endOfMonth(last) };
}
