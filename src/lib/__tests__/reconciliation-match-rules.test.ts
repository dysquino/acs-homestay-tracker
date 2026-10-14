import { describe, expect, it } from "vitest";

import { formatExactCentavos } from "../finance";
import {
  assertActor,
  assertBankPostedDate,
  batchTotals,
  directionFor,
  matchSourceType,
  MatchError,
  remainingCentavos,
  totalRequested,
  validateBatch,
  validateMatchAmount,
  type BatchCandidate,
} from "../reconciliation-match-rules";

describe("directionFor", () => {
  it("derives inflow from a receipt and outflow from a payout", () => {
    // Deliberately not client-supplied: a receipt is money in and a payout is
    // money out, full stop.
    expect(directionFor("BOOKING_PAYMENT")).toBe("INFLOW");
    expect(directionFor("EXPENSE_SETTLEMENT")).toBe("OUTFLOW");
  });
});

describe("remainingCentavos", () => {
  it("is the whole amount when nothing is matched", () => {
    expect(remainingCentavos(850000n, 0n)).toBe(850000n);
  });

  it("is the leftover after a partial match", () => {
    expect(remainingCentavos(850000n, 300000n)).toBe(550000n);
  });

  it("is zero once fully matched", () => {
    expect(remainingCentavos(850000n, 850000n)).toBe(0n);
  });

  it("clamps to zero when over-matched rather than going negative", () => {
    // A negative remainder must never be rendered as a negative amount.
    expect(remainingCentavos(850000n, 900000n)).toBe(0n);
  });
});

describe("validateMatchAmount", () => {
  it("accepts an amount within what's left", () => {
    expect(() => validateMatchAmount(500000n, 550000n)).not.toThrow();
    expect(() => validateMatchAmount(550000n, 550000n)).not.toThrow();
  });

  it("refuses more than what's left", () => {
    // This is the check that makes two owners matching the same deposit fail
    // for the loser instead of both succeeding (§14).
    expect(() => validateMatchAmount(550001n, 550000n)).toThrow(MatchError);
    expect(() => validateMatchAmount(550001n, 550000n)).toThrow(/more than the amount left/);
  });

  it("refuses anything when nothing is left", () => {
    expect(() => validateMatchAmount(1n, 0n)).toThrow(MatchError);
  });

  it("refuses zero and negative amounts", () => {
    // Direction comes from the source type, so a negative is meaningless.
    expect(() => validateMatchAmount(0n, 1000n)).toThrow(/greater than zero/);
    expect(() => validateMatchAmount(-100n, 1000n)).toThrow(/greater than zero/);
  });

  it("distinguishes an over-match by exactly one centavo", () => {
    expect(() => validateMatchAmount(100001n, 100000n)).toThrow(MatchError);
  });
});

describe("assertBankPostedDate", () => {
  it("accepts a YYYY-MM-DD date", () => {
    expect(assertBankPostedDate("2026-10-13")).toBe("2026-10-13");
  });

  it("rejects anything else", () => {
    for (const bad of ["2026-13-01", "13-01-2026", "2026/10/13", "", "today", "2026-10-13T00:00"]) {
      expect(() => assertBankPostedDate(bad), bad).toThrow(MatchError);
    }
  });
});

describe("assertActor", () => {
  it("trims and accepts a name", () => {
    expect(assertActor("  Dys  ")).toBe("Dys");
  });

  it("refuses a blank actor, since the audit trail needs one", () => {
    expect(() => assertActor("")).toThrow(MatchError);
    expect(() => assertActor("   ")).toThrow(/pick your name/);
  });

  it("caps an overlong name rather than failing the write", () => {
    expect(assertActor("x".repeat(500))).toHaveLength(100);
  });
});

describe("totalRequested", () => {
  it("adds a group exactly", () => {
    expect(totalRequested([{ amountCentavos: 300000n }, { amountCentavos: 200000n }])).toBe(500000n);
  });

  it("sums a group where floats would drift", () => {
    const parts = [{ amountCentavos: 10n }, { amountCentavos: 20n }, { amountCentavos: 30n }];
    expect(totalRequested(parts)).toBe(60n);
  });

  it("is zero for an empty group", () => {
    expect(totalRequested([])).toBe(0n);
  });
});
describe("matchSourceType", () => {
  it("maps the pool's stored enum value to the match source type", () => {
    // The pool stores Prisma's enum names and the match stores its own. Filing a
    // receipt as a payout would invert the money, and nothing else would catch it
    // because direction is derived from this rather than submitted.
    expect(matchSourceType("booking_payment")).toBe("BOOKING_PAYMENT");
    expect(matchSourceType("expense_settlement")).toBe("EXPENSE_SETTLEMENT");
  });
});

describe("batchTotals", () => {
  const inflow = (sourceId: string, amount: number): BatchCandidate => ({
    sourceType: "BOOKING_PAYMENT",
    sourceId,
    amount,
  });
  const outflow = (sourceId: string, amount: number): BatchCandidate => ({
    sourceType: "EXPENSE_SETTLEMENT",
    sourceId,
    amount,
  });

  it("is all zeroes for an empty selection", () => {
    expect(batchTotals([])).toEqual({
      count: 0,
      inflowCentavos: 0n,
      outflowCentavos: 0n,
      netCentavos: 0n,
    });
  });

  it("puts every receipt on the in side and leaves out at zero", () => {
    expect(batchTotals([inflow("a", 2500.5), inflow("b", 1000.25)])).toEqual({
      count: 2,
      inflowCentavos: 350075n,
      outflowCentavos: 0n,
      netCentavos: 350075n,
    });
  });

  it("puts every payout on the out side and reports net as negative", () => {
    // The sign is what tells the interface which side of the month this lands on.
    expect(batchTotals([outflow("a", 800), outflow("b", 200.5)])).toEqual({
      count: 2,
      inflowCentavos: 0n,
      outflowCentavos: 100050n,
      netCentavos: -100050n,
    });
  });

  it("keeps both sides visible when a selection spans them", () => {
    expect(batchTotals([inflow("a", 500), outflow("b", 200)])).toEqual({
      count: 2,
      inflowCentavos: 50000n,
      outflowCentavos: 20000n,
      netCentavos: 30000n,
    });
  });

  it("adds exactly where float addition would drift", () => {
    // 0.1 + 0.2 in pesos is 0.30000000000000004; in centavos it is exactly 30.
    const totals = batchTotals([inflow("a", 0.1), inflow("b", 0.2)]);
    expect(totals.inflowCentavos).toBe(30n);
    expect(formatExactCentavos(totals.netCentavos)).toBe("0.30");
  });
});

describe("validateBatch", () => {
  const inflow = (sourceId: string, amount: number): BatchCandidate => ({
    sourceType: "BOOKING_PAYMENT",
    sourceId,
    amount,
  });
  const outflow = (sourceId: string, amount: number): BatchCandidate => ({
    sourceType: "EXPENSE_SETTLEMENT",
    sourceId,
    amount,
  });

  it("accepts a group that adds up to the statement figure", () => {
    // The Airbnb case: three stays, one deposit.
    expect(() =>
      validateBatch([inflow("a", 2500), inflow("b", 3000), inflow("c", 2000)], 750000n),
    ).not.toThrow();
  });

  it("accepts a group of payouts against a debit", () => {
    expect(() => validateBatch([outflow("a", 4500), outflow("b", 500)], 500000n)).not.toThrow();
  });

  it("refuses an empty selection", () => {
    expect(() => validateBatch([], 0n)).toThrow(/at least one transaction/);
  });

  it("refuses a group that mixes money in with money out", () => {
    // One statement line is one movement. A mixed group under one
    // statementGroupKey would claim two opposite movements arrived as one line,
    // and the month's totals would stop meaning anything.
    expect(() => validateBatch([inflow("a", 500), outflow("b", 500)], 100000n)).toThrow(
      /one direction/i,
    );
  });

  it("reports the direction rule before the total, since that's the real mistake", () => {
    // A mixed selection also won't add up to anything meaningful, so the order
    // of these checks decides which message the owner actually sees.
    expect(() => validateBatch([inflow("a", 500), outflow("b", 200)], 999n)).toThrow(
      /one direction/i,
    );
  });

  it("refuses a group short of the statement figure", () => {
    expect(() => validateBatch([inflow("a", 2000), inflow("b", 2000)], 500000n)).toThrow(
      /don't add up/i,
    );
  });

  it("refuses a group over the statement figure", () => {
    expect(() => validateBatch([inflow("a", 3000), inflow("b", 3000)], 500000n)).toThrow(
      MatchError,
    );
  });

  it("distinguishes a group that is a centavo out from one that ties out", () => {
    // §8.6 wants an exact zero. Being close is not the same as being right, and a
    // group is exactly where a hidden centavo would survive until finalization.
    expect(() => validateBatch([inflow("a", 2000), inflow("b", 2000)], 400001n)).toThrow(
      MatchError,
    );
    expect(() => validateBatch([inflow("a", 2000), inflow("b", 2000)], 400000n)).not.toThrow();
  });

  it("reads the statement figure as a positive amount of pesos, whatever the sign", () => {
    // The keypad's − toggle flips the entry for a payout; the group total is
    // already the absolute value of the money, so a negative entry still ties.
    const group = [outflow("a", 3000)];
    expect(batchTotals(group).netCentavos).toBe(-300000n);
    expect(() => validateBatch(group, 300000n)).not.toThrow();
  });
});
