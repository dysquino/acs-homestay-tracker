import {
  addDays,
  addMonths,
  endOfMonth,
  isWithin,
  occupiedNights,
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

/**
 * What the booking earns you: the total payout, which is the amount you
 * actually receive. Airbnb's service fee is already taken out of that figure
 * (its "Paid out" column), so `platformFee` is kept for reference only and
 * must NOT be subtracted again. The guest's cleaning fee is not part of the
 * calculation either: cleaners are paid a fixed amount, which is recorded
 * separately as a cleaning expense.
 */
export function bookingNetIncome(b: Booking): number {
  return b.totalPayout;
}

export function incomeInRange(
  bookings: Booking[],
  from: ISODate,
  to: ISODate,
): number {
  // A stay that spans a month boundary has its net income split
  // proportionally by how many of its nights fall in the range, rather
  // than attributing the whole thing to check-in (or check-out) month.
  return bookings.reduce((sum, b) => {
    const nights = occupiedNights(b.checkIn, b.checkOut);
    if (nights.length === 0) return sum;
    const nightsInRange = nights.filter((n) => isWithin(n, from, to)).length;
    if (nightsInRange === 0) return sum;
    return sum + (bookingNetIncome(b) * nightsInRange) / nights.length;
  }, 0);
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
  /**
   * The part of `net` actually in hand: income from bookings marked paid
   * (split by nights, same as `income`) minus expenses already paid out
   * (refunded / paid directly — not ones still owed back to whoever fronted
   * them). Answers "have we got this month's profit yet?".
   */
  collected: number;
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
  const paidIncome = incomeInRange(
    bookings.filter((b) => b.paymentStatus === "paid"),
    from,
    to,
  );
  const paidOut = expensesInRange(
    expenses.filter((e) => e.refundStatus === "refunded"),
    from,
    to,
  );
  return {
    month: from,
    income,
    expenses: spent,
    net: income - spent,
    collected: paidIncome - paidOut,
  };
}

/** `count` consecutive month summaries ending at (and including) `endMonth`. */
export function monthSeries(
  bookings: Booking[],
  expenses: Expense[],
  endMonth: ISODate,
  count: number,
): MonthSummary[] {
  return Array.from({ length: count }, (_, i) =>
    monthSummary(bookings, expenses, addMonths(startOfMonth(endMonth), i - (count - 1))),
  );
}

export type OccupancyDay = { date: ISODate; booked: boolean };

/** Which nights of a month are occupied — the check-out day is not a night. */
export function occupancyInMonth(
  bookings: Booking[],
  anyDayInMonth: ISODate,
): { days: OccupancyDay[]; bookedNights: number } {
  const from = startOfMonth(anyDayInMonth);
  const to = endOfMonth(anyDayInMonth);
  const booked = new Set<ISODate>();
  for (const b of bookings) {
    for (const night of occupiedNights(b.checkIn, b.checkOut)) {
      if (isWithin(night, from, to)) booked.add(night);
    }
  }
  const days: OccupancyDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push({ date: d, booked: booked.has(d) });
  }
  return { days, bookedNights: booked.size };
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
  // On a same-day turnover the departing guest comes first.
  const rank = (e: UpcomingEvent) => (e.kind === "check-out" ? 0 : 1);
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b),
  );
}

/**
 * Cleanings that are actually owed: done, but not yet paid. A scheduled
 * cleaning that hasn't happened yet isn't a debt.
 */
export function unpaidCleanings(cleaning: CleaningRecord[]): CleaningRecord[] {
  return cleaning
    .filter((c) => c.paymentStatus === "unpaid" && c.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Money owed per cleaner, largest first. */
export function amountOwedByCleaner(
  cleaning: CleaningRecord[],
): { cleaner: string; total: number; count: number }[] {
  // "Ate Nene" and "ate nene" are the same person: group case-insensitively,
  // and show the first spelling seen.
  const buckets = new Map<string, { cleaner: string; total: number; count: number }>();
  for (const c of unpaidCleanings(cleaning)) {
    const name = c.cleanerName.trim() || "Unassigned";
    const key = name.toLowerCase();
    const bucket = buckets.get(key) ?? { cleaner: name, total: 0, count: 0 };
    bucket.total += c.paymentAmount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total);
}

export function pendingGuestPayments(bookings: Booking[]): Booking[] {
  return bookings
    .filter((b) => b.paymentStatus !== "paid")
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

/**
 * Expenses someone paid for personally and hasn't been paid back for yet —
 * oldest first, so the longest-outstanding one leads.
 */
export function unrefundedExpenses(expenses: Expense[]): Expense[] {
  return expenses
    .filter((e) => e.refundStatus === "owed")
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A booking's cleanings that deleting the booking would keep (just unlinked)
 * because real work or money is recorded on them — mirrors the rule in
 * `deleteBooking`. Only an untouched auto-created turnover (scheduled,
 * unpaid, no cleaner, no notes) is removed with its booking.
 */
export function cleaningsKeptOnDelete(
  cleaning: CleaningRecord[],
  bookingId: string,
): CleaningRecord[] {
  return cleaning.filter(
    (c) =>
      c.bookingId === bookingId &&
      !(
        c.status === "scheduled" &&
        c.paymentStatus === "unpaid" &&
        c.cleanerName === "" &&
        c.notes === ""
      ),
  );
}

/** Distinct cleaner names already used, for the datalist on the form. */
export function knownCleaners(cleaning: CleaningRecord[]): string[] {
  const byLowerCase = new Map<string, string>();
  for (const c of cleaning) {
    const name = c.cleanerName.trim();
    if (name && !byLowerCase.has(name.toLowerCase())) byLowerCase.set(name.toLowerCase(), name);
  }
  return [...byLowerCase.values()].sort((a, b) => a.localeCompare(b));
}


export type MoneyInBank = {
  /** Payouts of bookings marked paid. */
  income: number;
  incomeCount: number;
  /** Expenses already settled: paid directly, or refunded to whoever fronted them. */
  spent: number;
  expenseCount: number;
  balance: number;
};

/**
 * What should be in the bank, all time: income from paid bookings minus
 * expenses that have actually been paid out. Pending and partial bookings
 * aren't counted (that money hasn't arrived), nor are expenses still owed
 * back to whoever fronted them (that money hasn't left yet). Assumes every
 * payout lands in the bank and nothing else is withdrawn.
 */
export function moneyInBank(bookings: Booking[], expenses: Expense[]): MoneyInBank {
  const paid = bookings.filter((b) => b.paymentStatus === "paid");
  const settled = expenses.filter((e) => e.refundStatus === "refunded");
  const income = paid.reduce((sum, b) => sum + bookingNetIncome(b), 0);
  const spent = settled.reduce((sum, e) => sum + e.amount, 0);
  return {
    income,
    incomeCount: paid.length,
    spent,
    expenseCount: settled.length,
    balance: income - spent,
  };
}

export type Group<T> = { key: string; items: T[]; count: number; total: number };

/**
 * Splits an already-sorted list into runs sharing a key (a day, a month…),
 * for group headings in long lists. `items` is what's on screen (e.g. one
 * page); `count`/`total` come from `all` (every matching record), so a group
 * split across pages still shows its full total.
 */
export function groupRuns<T>(
  items: T[],
  all: T[],
  keyOf: (x: T) => string,
  amountOf: (x: T) => number,
): Group<T>[] {
  const totals = new Map<string, { count: number; total: number }>();
  for (const x of all) {
    const k = keyOf(x);
    const t = totals.get(k) ?? { count: 0, total: 0 };
    t.count += 1;
    t.total += amountOf(x);
    totals.set(k, t);
  }
  const groups: Group<T>[] = [];
  for (const x of items) {
    const k = keyOf(x);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(x);
    else groups.push({ key: k, items: [x], ...(totals.get(k) ?? { count: 1, total: amountOf(x) }) });
  }
  return groups;
}

export type DayGroup<T> = { date: ISODate; items: T[]; count: number; total: number };

/** groupRuns by `date`, totalling `amount` — for expense lists. */
export function groupByDay<T extends { date: ISODate; amount: number }>(items: T[], all: T[] = items): DayGroup<T>[] {
  return groupRuns(items, all, (x) => x.date, (x) => x.amount).map(({ key, ...g }) => ({ date: key, ...g }));
}
