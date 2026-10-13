/**
 * Pool filters (§7.5).
 *
 * The outstanding pools hold three kinds of record and the owner usually wants
 * one of them at a time: receipts when reading a deposit, refunds when chasing
 * money that went back out. Filters are a view over rows already loaded, so they
 * live here — pure and unit-testable — rather than as extra queries against a
 * month that is already in memory.
 *
 * `AUTO` is not a fifth bucket. It shows everything and lets the keypad's sign
 * do the prioritising (§7.5: a positive amount looks in receipts, a negative in
 * payouts), which is why it is the default and why picking it never hides a row
 * the owner might be looking for.
 *
 * Adjustments are deliberately absent. They carry their own bank posting date
 * and land in the month's totals directly (§4.7), so they are ledger entries
 * rather than outstanding pool rows — offering a filter over a list that can
 * never contain them would be a control that always shows nothing.
 */

export type PoolKind = "receipt" | "payout" | "refund";

export type PoolFilter = "AUTO" | "BOOKINGS" | "EXPENSES" | "REFUNDS";

/** What each filter shows, in the order the chips render. */
export const FILTERS: { value: PoolFilter; label: string }[] = [
  { value: "AUTO", label: "Auto" },
  { value: "BOOKINGS", label: "Bookings" },
  { value: "EXPENSES", label: "Expenses" },
  { value: "REFUNDS", label: "Refunds" },
];

/**
 * Which kinds of record a filter admits.
 *
 * Expressed as a set of kinds rather than a predicate so the count of matching
 * rows is derivable — the chip badges need it, and deriving it from the same
 * definition the predicate uses keeps them from disagreeing.
 */
const KINDS: Record<PoolFilter, PoolKind[]> = {
  AUTO: ["receipt", "payout", "refund"],
  BOOKINGS: ["receipt"],
  EXPENSES: ["payout"],
  REFUNDS: ["refund"],
};

/** Whether one row belongs under `filter`. */
export function matchesFilter(kind: PoolKind, filter: PoolFilter): boolean {
  return KINDS[filter].includes(kind);
}

/** Keep only the rows a filter admits, preserving their order. */
export function filterByKind<T extends { kind: PoolKind }>(
  items: T[],
  filter: PoolFilter,
): T[] {
  return items.filter((item) => matchesFilter(item.kind, filter));
}

/** How many rows a filter would show, for the chip badge. */
export function countByKind(items: { kind: PoolKind }[], filter: PoolFilter): number {
  return items.reduce((n, item) => n + (matchesFilter(item.kind, filter) ? 1 : 0), 0);
}