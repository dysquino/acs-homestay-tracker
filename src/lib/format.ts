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

export function formatCurrency(amount: number, precise = false): string {
  return (precise ? pesoPrecise : peso).format(amount || 0);
}

/** Signed amount, for profit figures that can go negative. */
export function formatSigned(amount: number): string {
  const s = formatCurrency(Math.abs(amount));
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

export function formatWeekday(iso: ISODate): string {
  return weekdayFmt.format(parseISO(iso));
}

export function formatDateRange(from: ISODate, to: ISODate): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear
    ? `${formatShortDate(from)} – ${formatDate(to)}`
    : `${formatDate(from)} – ${formatDate(to)}`;
}
