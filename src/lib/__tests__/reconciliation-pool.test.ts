import { describe, expect, it } from "vitest";

import {
  buildPool,
  outstandingFor,
  poolKey,
  poolTotal,
  type MatchedTotals,
  type PoolRecord,
} from "../reconciliation-pool";

const receipt = (over: Partial<PoolRecord> = {}): PoolRecord => ({
  id: "p1",
  sourceType: "booking_payment",
  amountCentavos: 250000n,
  recordDate: "2026-06-04",
  label: "Jane Doe",
  detail: "Airbnb",
  reference: "",
  bookingSource: "AIRBNB",
  ...over,
});

const payout = (over: Partial<PoolRecord> = {}): PoolRecord => ({
  id: "s1",
  sourceType: "expense_settlement",
  amountCentavos: 80000n,
  recordDate: "2026-06-10",
  label: "Aircon repair",
  detail: "Paid vendor",
  reference: "",
  settlementType: "DIRECT_VENDOR_PAYMENT",
  ...over,
});

const totals = (entries: Record<string, bigint>): MatchedTotals => new Map(Object.entries(entries));

describe("buildPool", () => {
  it("shows a record with nothing matched", () => {
    const pool = buildPool([receipt()], new Map(), "2026-06");
    expect(pool).toHaveLength(1);
    expect(pool[0].amount).toBe(2500);
    expect(pool[0].kind).toBe("receipt");
  });

  it("drops a fully matched record", () => {
    expect(buildPool([receipt()], totals({ "booking_payment:p1": 250000n }), "2026-06")).toEqual([]);
  });

  it("shows only the remainder of a partially matched record", () => {
    const pool = buildPool([receipt()], totals({ "booking_payment:p1": 100000n }), "2026-06");
    expect(pool[0].amount).toBe(1500);
  });

  it("treats a June receipt cleared by an August deposit as settled", () => {
    // The regression this module exists to prevent: outstanding is a property of
    // the record, not of the month its match posted in. Before, the matched
    // total was filtered by the match's bank-posting date, so a June pool still
    // showed a receipt the bank had already paid in August — a month that was
    // genuinely reconciled looked unfinished every time anyone looked back.
    const june = buildPool(
      [receipt({ recordDate: "2026-06-04" })],
      // The match posted in August. June is looking at its own pool.
      totals({ "booking_payment:p1": 250000n }),
      "2026-06",
    );
    expect(june).toEqual([]);
  });

  it("still shows the remainder when only part cleared late", () => {
    const june = buildPool(
      [receipt({ recordDate: "2026-06-04" })],
      totals({ "booking_payment:p1": 200000n }),
      "2026-06",
    );
    expect(june[0].amount).toBe(500);
  });

  it("marks a record from an earlier month as carry-over", () => {
    const pool = buildPool([receipt({ recordDate: "2026-05-28" })], new Map(), "2026-06");
    expect(pool[0].older).toBe(true);
  });

  it("does not mark a record from the same month as carry-over", () => {
    expect(buildPool([receipt()], new Map(), "2026-06")[0].older).toBe(false);
  });

  it("does not mark a record from a later month as carry-over", () => {
    // Comparing the wrong direction would label this month's records as old.
    expect(buildPool([receipt({ recordDate: "2026-07-01" })], new Map(), "2026-06")[0].older).toBe(
      false,
    );
  });

  it("separates a guest refund from an ordinary payout", () => {
    const pool = buildPool(
      [
        payout({ id: "s1", settlementType: "GUEST_REFUND" }),
        payout({ id: "s2", settlementType: "DIRECT_VENDOR_PAYMENT" }),
        payout({ id: "s3", settlementType: "CLEANER_PAYMENT" }),
      ],
      new Map(),
      "2026-06",
    );
    expect(pool.map((p) => p.kind)).toEqual(["refund", "payout", "payout"]);
  });

  it("keeps both source kinds apart when ids collide", () => {
    // `${sourceType}:${id}` is the key precisely because ids are only unique
    // within a table — a match and a settlement can share an id string.
    const pool = buildPool(
      [receipt({ id: "same" }), payout({ id: "same" })],
      totals({ "booking_payment:same": 250000n }),
      "2026-06",
    );
    expect(pool).toHaveLength(1);
    expect(pool[0].sourceType).toBe("expense_settlement");
  });

  it("ignores a matched total that exceeds the record, rather than going negative", () => {
    const pool = buildPool([receipt({ amountCentavos: 100000n })], totals({ "booking_payment:p1": 250000n }), "2026-06");
    expect(pool).toEqual([]);
  });

  it("returns an empty pool for no records", () => {
    expect(buildPool([], new Map(), "2026-06")).toEqual([]);
  });
});

describe("outstandingFor", () => {
  it("is the full amount when nothing is matched", () => {
    expect(outstandingFor(receipt(), new Map())).toBe(250000n);
  });

  it("subtracts what is matched", () => {
    expect(outstandingFor(receipt(), totals({ "booking_payment:p1": 75000n }))).toBe(175000n);
  });

  it("floors at zero rather than going negative", () => {
    expect(outstandingFor(receipt(), totals({ "booking_payment:p1": 999999n }))).toBe(0n);
  });

  it("keys on the source type as well as the id", () => {
    const record = payout({ id: "p1" });
    // Same id, different table — the total for the receipt must not apply.
    expect(outstandingFor(record, totals({ "booking_payment:p1": 250000n }))).toBe(80000n);
  });
});

describe("poolKey", () => {
  it("is the source type and id joined", () => {
    expect(poolKey("booking_payment", "abc")).toBe("booking_payment:abc");
  });
});

describe("poolTotal", () => {
  it("adds the pool exactly", () => {
    const pool = buildPool(
      [
        receipt({ id: "p1", amountCentavos: 100005n }),
        receipt({ id: "p2", amountCentavos: 99950n }),
      ],
      new Map(),
      "2026-06",
    );
    expect(poolTotal(pool)).toBe(199955n);
  });

  it("is zero for an empty pool", () => {
    expect(poolTotal([])).toBe(0n);
  });
});