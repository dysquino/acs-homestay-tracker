import { describe, expect, it } from "vitest";

import {
  assertActor,
  assertBankPostedDate,
  directionFor,
  MatchError,
  remainingCentavos,
  totalRequested,
  validateMatchAmount,
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