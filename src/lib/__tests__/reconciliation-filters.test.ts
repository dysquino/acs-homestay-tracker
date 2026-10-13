import { describe, expect, it } from "vitest";

import {
  countByKind,
  FILTERS,
  filterByKind,
  matchesFilter,
  type PoolFilter,
  type PoolKind,
} from "../reconciliation-filters";

const row = (key: string, kind: PoolKind) => ({ key, kind });

const POOL: { key: string; kind: PoolKind }[] = [
  row("r1", "receipt"),
  row("r2", "receipt"),
  row("p1", "payout"),
  row("p2", "payout"),
  row("f1", "refund"),
];

describe("matchesFilter", () => {
  it("shows every kind of record under Auto", () => {
    // Auto is the default and the escape hatch: it must never hide a row the
    // owner might be looking for, so it admits all three kinds rather than
    // guessing from the keypad's sign.
    for (const kind of ["receipt", "payout", "refund"] as PoolKind[]) {
      expect(matchesFilter(kind, "AUTO"), kind).toBe(true);
    }
  });

  it("shows only receipts under Bookings", () => {
    expect(matchesFilter("receipt", "BOOKINGS")).toBe(true);
    expect(matchesFilter("payout", "BOOKINGS")).toBe(false);
    expect(matchesFilter("refund", "BOOKINGS")).toBe(false);
  });

  it("shows only vendor payouts under Expenses, never refunds", () => {
    // A refund is money going back to a guest, which is a different question
    // from money going to a vendor. Folding them together is how one gets
    // quietly left behind while the other is being chased.
    expect(matchesFilter("payout", "EXPENSES")).toBe(true);
    expect(matchesFilter("refund", "EXPENSES")).toBe(false);
  });

  it("shows only guest refunds under Refunds", () => {
    expect(matchesFilter("refund", "REFUNDS")).toBe(true);
    expect(matchesFilter("payout", "REFUNDS")).toBe(false);
    expect(matchesFilter("receipt", "REFUNDS")).toBe(false);
  });
});

describe("filterByKind", () => {
  it("keeps every row in order under Auto", () => {
    expect(filterByKind(POOL, "AUTO")).toEqual(POOL);
  });

  it("narrows to receipts without reordering them", () => {
    expect(filterByKind(POOL, "BOOKINGS").map((r) => r.key)).toEqual(["r1", "r2"]);
  });

  it("narrows to vendor payouts", () => {
    expect(filterByKind(POOL, "EXPENSES").map((r) => r.key)).toEqual(["p1", "p2"]);
  });

  it("narrows to refunds", () => {
    expect(filterByKind(POOL, "REFUNDS").map((r) => r.key)).toEqual(["f1"]);
  });

  it("returns nothing for an empty pool rather than throwing", () => {
    expect(filterByKind([], "BOOKINGS")).toEqual([]);
    expect(filterByKind([], "AUTO")).toEqual([]);
  });

  it("does not mutate the list it was given", () => {
    const input = [...POOL];
    filterByKind(input, "BOOKINGS");
    expect(input).toEqual(POOL);
  });

  it("returns an empty list when a filter matches nothing left", () => {
    expect(filterByKind([row("r1", "receipt")], "REFUNDS")).toEqual([]);
  });
});

describe("countByKind", () => {
  it("counts what each filter would leave visible", () => {
    // The chip badges come from this, and "Refunds 0" is the answer to "are
    // there any refunds left?" without having to switch filters to find out.
    expect(countByKind(POOL, "AUTO")).toBe(5);
    expect(countByKind(POOL, "BOOKINGS")).toBe(2);
    expect(countByKind(POOL, "EXPENSES")).toBe(2);
    expect(countByKind(POOL, "REFUNDS")).toBe(1);
  });

  it("agrees with filterByKind, which is the point of deriving both one way", () => {
    for (const f of FILTERS) {
      expect(countByKind(POOL, f.value), f.label).toBe(filterByKind(POOL, f.value).length);
    }
  });

  it("is zero for an empty pool", () => {
    expect(countByKind([], "AUTO")).toBe(0);
  });
});

describe("FILTERS", () => {
  it("offers Auto first, since it is the default", () => {
    expect(FILTERS[0].value).toBe<PoolFilter>("AUTO");
  });

  it("offers exactly the pool filters and no dead ones", () => {
    // Adjustments carry their own bank posting date and land in the month's
    // totals directly (§4.7), so they never appear in the outstanding pools.
    // A chip over a list that can never hold them would always read zero.
    expect(FILTERS.map((f) => f.value)).toEqual(["AUTO", "BOOKINGS", "EXPENSES", "REFUNDS"]);
  });

  it("gives every filter a label", () => {
    for (const f of FILTERS) expect(f.label).not.toBe("");
  });
});