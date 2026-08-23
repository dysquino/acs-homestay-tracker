import {
  addDays,
  endOfMonth,
  isWithin,
  rangesOverlap,
  startOfMonth,
  today,
} from "./dates";
import type { Booking, CleaningRecord, Expense, ISODate } from "./types";

/** Bookings whose dates clash with the given range, ignoring `excludeId`. */
export function findConflicts(
  bookings: Booking[],
  checkIn: ISODate,
  checkOut: ISODate,
  excludeId?: string,
): Booking[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  return bookings.filter(
    (b) =>
      b.id !== excludeId &&
      rangesOverlap(checkIn, checkOut, b.checkIn, b.checkOut),
  );
}

export function bookingNetIncome(b: Booking): number {
  return b.totalPayout - b.platformFee;
}

export function incomeInRange(
  bookings: Booking[],
  from: ISODate,
  to: ISODate,
): number {
  // Attributed to the check-in date — that's when the stay is booked in.
  return bookings
    .filter((b) => isWithin(b.checkIn, from, to))
    .reduce((sum, b) => sum + bookingNetIncome(b), 0);
}

export function expensesInRange(
  expenses: Expense[],
  from: ISODate,
  to: ISODate,
): number {
  return expenses
    .filter((e) => isWithin(e.date, from, to))
    .reduce((sum, e) => sum + e.amount, 0);
}

export type MonthSummary = {
  month: ISODate; // first day of the month
  income: number;
  expenses: number;
  net: number;
};

export function monthSummary(
  bookings: Booking[],
  expenses: Expense[],
  anyDayInMonth: ISODate = today(),
): MonthSummary {
  const from = startOfMonth(anyDayInMonth);
  const to = endOfMonth(anyDayInMonth);
  const income = incomeInRange(bookings, from, to);
  const spent = expensesInRange(expenses, from, to);
  return { month: from, income, expenses: spent, net: income - spent };
}

/** Per-month expense totals, newest first. */
export function expensesByMonth(
  expenses: Expense[],
): { month: string; total: number; count: number }[] {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const key = e.date.slice(0, 7);
    const bucket = buckets.get(key) ?? { total: 0, count: 0 };
    bucket.total += e.amount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, v]) => ({ month, ...v }));
}

export type UpcomingEvent = {
  kind: "check-in" | "check-out";
  date: ISODate;
  booking: Booking;
};

/** Check-ins and check-outs falling in the next `days` days, soonest first. */
export function upcomingEvents(
  bookings: Booking[],
  days = 7,
  from: ISODate = today(),
): UpcomingEvent[] {
  const to = addDays(from, days);
  const events: UpcomingEvent[] = [];
  for (const b of bookings) {
    if (isWithin(b.checkIn, from, to))
      events.push({ kind: "check-in", date: b.checkIn, booking: b });
    if (isWithin(b.checkOut, from, to))
      events.push({ kind: "check-out", date: b.checkOut, booking: b });
  }
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind),
  );
}

export function unpaidCleanings(cleaning: CleaningRecord[]): CleaningRecord[] {
  return cleaning
    .filter((c) => c.paymentStatus === "unpaid")
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Money owed per cleaner, largest first. */
export function amountOwedByCleaner(
  cleaning: CleaningRecord[],
): { cleaner: string; total: number; count: number }[] {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const c of unpaidCleanings(cleaning)) {
    const key = c.cleanerName.trim() || "Unassigned";
    const bucket = buckets.get(key) ?? { total: 0, count: 0 };
    bucket.total += c.paymentAmount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([cleaner, v]) => ({ cleaner, ...v }))
    .sort((a, b) => b.total - a.total);
}

export function pendingGuestPayments(bookings: Booking[]): Booking[] {
  return bookings
    .filter((b) => b.paymentStatus !== "paid")
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

/** Distinct cleaner names already used, for the datalist on the form. */
export function knownCleaners(cleaning: CleaningRecord[]): string[] {
  return [
    ...new Set(cleaning.map((c) => c.cleanerName.trim()).filter(Boolean)),
  ].sort();
}

/** Distinct payer names already used, for the datalist on the expense form. */
export function knownPayers(expenses: Expense[]): string[] {
  return [
    ...new Set(expenses.map((e) => e.paidBy.trim()).filter(Boolean)),
  ].sort();
}
