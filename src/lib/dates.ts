import type { ISODate } from "./types";

/** Parse a `YYYY-MM-DD` string into a local-midnight Date. */
export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as `YYYY-MM-DD` using local calendar fields. */
export function toISO(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function today(): ISODate {
  return toISO(new Date());
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const d = parseISO(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return toISO(d);
}

/** Whole days from `a` to `b` (negative if b is earlier). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfMonth(iso: ISODate): ISODate {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function isWithin(iso: ISODate, from: ISODate, to: ISODate): boolean {
  return iso >= from && iso <= to;
}

/**
 * Two stays overlap when one starts before the other ends. A check-out and a
 * check-in on the same day is fine — that's a normal same-day turnover.
 */
export function rangesOverlap(
  aStart: ISODate,
  aEnd: ISODate,
  bStart: ISODate,
  bEnd: ISODate,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Nights in a stay. Always at least 0. */
export function nightCount(checkIn: ISODate, checkOut: ISODate): number {
  return Math.max(0, daysBetween(checkIn, checkOut));
}

/**
 * The 6-week grid (42 days) covering the month that `iso` falls in, starting
 * on Sunday. Used by the booking calendar.
 */
export function monthGrid(iso: ISODate): ISODate[] {
  const first = parseISO(startOfMonth(iso));
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return toISO(d);
  });
}

/** Every occupied night of a stay — check-out day excluded. */
export function occupiedNights(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}
