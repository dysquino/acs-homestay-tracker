import { parseISO } from "./dates";
import type { ISODate } from "./types";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const pesoPrecise = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A recorded amount (a payout, an expense, a cleaning fee, or a sum of them):
 * whole pesos when there are no centavos, otherwise exact — ₱1,234.50 is never
 * shown as ₱1,235, so a table's rows always add up to its total.
 */
export function formatCurrency(amount: number): string {
  const cents = Math.round((amount || 0) * 100);
  return (cents % 100 === 0 ? peso : pesoPrecise).format(cents / 100);
}

/**
 * A computed figure (prorated monthly income, profit, an average) rounded to
 * whole pesos. Centavos on a value like ₱23,587.33 would only add noise.
 */
export function formatWhole(amount: number): string {
  return peso.format(amount || 0);
}

const pesoCompact = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Short form for chart axes and callouts: ₱25K, ₱1.2M. */
export function formatCompactCurrency(amount: number): string {
  return pesoCompact.format(amount || 0);
}

/** Signed whole-peso amount, for profit figures that can go negative. */
export function formatSigned(amount: number): string {
  const s = formatWhole(Math.abs(amount));
  return amount < 0 ? `−${s}` : s;
}

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDateFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
});

const monthFmt = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  year: "numeric",
});

const shortMonthFmt = new Intl.DateTimeFormat("en-PH", { month: "short" });

const weekdayFmt = new Intl.DateTimeFormat("en-PH", { weekday: "short" });

export function formatDate(iso: ISODate): string {
  return dateFmt.format(parseISO(iso));
}

export function formatShortDate(iso: ISODate): string {
  return shortDateFmt.format(parseISO(iso));
}

export function formatMonth(iso: ISODate): string {
  return monthFmt.format(parseISO(iso));
}

export function formatShortMonth(iso: ISODate): string {
  return shortMonthFmt.format(parseISO(iso));
}

export function formatWeekday(iso: ISODate): string {
  return weekdayFmt.format(parseISO(iso));
}

export function formatDateRange(from: ISODate, to: ISODate): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear
    ? `${formatShortDate(from)} – ${formatDate(to)}`
    : `${formatDate(from)} – ${formatDate(to)}`;
}
