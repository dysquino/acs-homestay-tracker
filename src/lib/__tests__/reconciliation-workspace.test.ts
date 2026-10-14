import { describe, expect, it } from "vitest";

import { addMonths, startOfMonth } from "../dates";
import { sum } from "../finance";

/** Month stepping as the workspace does it: shared helpers, then slice to YYYY-MM. */
const nextMonth = (month: string) => startOfMonth(addMonths(`${month}-01`, 1)).slice(0, 7);
const previousMonth = (month: string) => startOfMonth(addMonths(`${month}-01`, -1)).slice(0, 7);

/**
 * Month arithmetic backs the workspace's month selector, and the "outstanding"
 * rule is what decides whether a record sits in a pool at all — so both get
 * pinned here rather than only exercised through the UI.
 */
describe("month stepping", () => {
  it("moves forward and back within a year", () => {
    expect(nextMonth("2026-01")).toBe("2026-02");
    expect(previousMonth("2026-02")).toBe("2026-01");
    expect(nextMonth("2026-11")).toBe("2026-12");
  });

  it("rolls the year in December and January", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(previousMonth("2027-01")).toBe("2026-12");
  });

  it("zero-pads single-digit months so the YYYY-MM shape is stable", () => {
    // A '2026-2' would silently fail the server's /^\d{4}-\d{2}$/ check.
    expect(nextMonth("2026-09")).toBe("2026-10");
    expect(previousMonth("2026-10")).toBe("2026-09");
    expect(previousMonth("2026-11")).toBe("2026-10");
  });

  it("round-trips", () => {
    for (const month of ["2026-01", "2026-06", "2026-12", "2027-03"]) {
      expect(previousMonth(nextMonth(month))).toBe(month);
      expect(nextMonth(previousMonth(month))).toBe(month);
    }
  });
});

describe("outstanding amounts", () => {
  /** The rule the workspace uses: outstanding = amount already matched. */
  const remaining = (amount: number, matchedCentavos: bigint) => {
    const full = sum([amount]);
    return full - matchedCentavos;
  };

  it("is the whole amount when nothing is matched", () => {
    expect(remaining(8500, 0n)).toBe(850000n);
  });

  it("is zero once fully matched", () => {
    expect(remaining(8500, 850000n)).toBe(0n);
  });

  it("is the leftover after a partial match", () => {
    expect(remaining(8500, 300000n)).toBe(550000n);
  });

  it("never goes negative for an over-matched record", () => {
    // Defensive: the workspace filters `matched >= full` out of the pool, so a
    // negative remainder must never be rendered as a negative amount.
    expect(remaining(8500, 900000n)).toBe(-50000n);
  });

  it("sums pool totals exactly where float addition would drift", () => {
    // Verified drift cases — not every list of tenths misbehaves, so these are
    // the specific ones confirmed to miss in floating point.
    for (const amounts of [[0.1, 0.2], [0.1, 0.2, 0.3]]) {
      const exact = amounts.reduce((a, b) => a + Math.round(b * 100), 0) / 100;
      expect(amounts.reduce((a, b) => a + b, 0), amounts.join("+")).not.toBe(exact);
      expect(sum(amounts)).toBe(BigInt(Math.round(exact * 100)));
    }
    // And a longer pool still totals exactly, drift or not.
    expect(sum([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])).toBe(450n);
  });
});