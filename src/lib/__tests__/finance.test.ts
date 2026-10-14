import { describe, expect, it } from "vitest";

import {
  absolute,
  assertWithinMax,
  formatExactCentavos,
  isWithinTolerance,
  MAX_CENTAVOS,
  negate,
  roundToCentavos,
  settleableAmount,
  subtract,
  sum,
  sumAmounts,
  toAmount,
  toCentavos,
} from "../finance";

describe("toCentavos", () => {
  it("converts pesos exactly", () => {
    expect(toCentavos(1234.56)).toBe(123456n);
    expect(toCentavos(0.1)).toBe(10n);
    expect(toCentavos(1000)).toBe(100000n);
  });

  it("converts the values floats get wrong", () => {
    // 1234.56 * 100 === 123456.00000000001 in floating point, so a naive
    // Math.round(amount * 100) is one centavo away from the truth for some
    // inputs. Going through the decimal string is what keeps this exact.
    expect(toCentavos(1234.56)).toBe(123456n);
    expect(toCentavos(1.005)).toBe(101n); // rounds the way a human reads it
    expect(toCentavos(0.07)).toBe(7n);
    expect(toCentavos(8.165)).toBe(817n);
  });

  it("handles negatives symmetrically", () => {
    expect(toCentavos(-1234.56)).toBe(-123456n);
    expect(toCentavos(-0.01)).toBe(-1n);
  });

  it("accepts strings, as form inputs arrive as text", () => {
    expect(toCentavos("1234.56")).toBe(123456n);
    expect(toCentavos("0")).toBe(0n);
    expect(toCentavos("0.05")).toBe(5n);
    expect(toCentavos("-500.25")).toBe(-50025n);
    expect(toCentavos("  42  ")).toBe(4200n);
  });

  it("treats trailing zeros past two decimals as insignificant", () => {
    expect(toCentavos("1.500")).toBe(150n);
    expect(toCentavos("1.5")).toBe(150n);
    expect(toCentavos("1.50")).toBe(150n);
    expect(toCentavos(1.5000000000000002)).toBe(150n);
  });

  it("rejects a real third decimal rather than silently rounding it", () => {
    // Letting a typed "1.505" through would make the stored value depend on the
    // caller's rounding rule — the centavo drift §8.6 forbids. A *string* is
    // user input, so its extra precision is an error worth reporting.
    expect(() => toCentavos("1.505")).toThrow(RangeError);
    expect(() => toCentavos("1234.567")).toThrow(RangeError);
  });

  it("rounds a float deterministically instead of rejecting it", () => {
    // A number can't carry user intent — 1.505 may just be what arithmetic
    // produced — so it's rounded half-up rather than refused. The rule is fixed
    // and named, which is what §8.6 asks for, so two callers can't disagree.
    expect(toCentavos(1.505)).toBe(151n);
    expect(toCentavos(1.504)).toBe(150n);
  });

  it("rejects values that aren't numbers", () => {
    expect(() => toCentavos("")).toThrow(RangeError);
    expect(() => toCentavos("abc")).toThrow(RangeError);
    expect(() => toCentavos("1,234.56")).toThrow(RangeError);
    expect(() => toCentavos(Number.NaN)).toThrow(RangeError);
    expect(() => toCentavos(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("toAmount", () => {
  it("is the exact inverse of toCentavos", () => {
    for (const value of [0, 1, 1234.56, 0.01, 999999.99, -45.67]) {
      expect(toAmount(toCentavos(value))).toBe(value);
    }
  });

  it("keeps centavos that floats would drop", () => {
    // 0.1 + 0.2 === 0.30000000000000004; the centavo sum must not.
    expect(toAmount(toCentavos(0.1) + toCentavos(0.2))).toBe(0.3);
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
  });

  it("handles negative centavos", () => {
    expect(toAmount(-1n)).toBe(-0.01);
    expect(toAmount(-123456n)).toBe(-1234.56);
  });
});

describe("sum", () => {
  it("is exact where float addition is not", () => {
    // Both verified drift cases: [0.1,0.2] and [0.1,0.3,0.8] each sum to a
    // value floats miss by ~2e-16, which is a centavo once it's been rounded,
    // displayed, and subtracted from a statement balance.
    expect([0.1, 0.2].reduce((a, b) => a + b, 0)).not.toBe(0.3); // 0.30000000000000004
    expect(sum([0.1, 0.2])).toBe(30n);

    expect([0.3, 0.4, 0.6].reduce((a, b) => a + b, 0)).not.toBe(1.3); // 1.2999999999999998
    expect(sum([0.3, 0.4, 0.6])).toBe(130n);
    expect(sumAmounts([0.3, 0.4, 0.6])).toBe(1.3);
  });

  it("never loses a centavo across many rows", () => {
    // 10,000 x P0.01 = P100.00. Float addition drifts well before this many
    // rows; centavos do not.
    const cents = Array.from({ length: 10_000 }, () => 0.01);
    expect(sum(cents)).toBe(10_000n);
    expect(sumAmounts(cents)).toBe(100);
  });

  it("is order-independent", () => {
    expect(sum([0.3, 0.1, 0.2])).toBe(sum([0.2, 0.3, 0.1]));
  });

  it("mixes bigint centavos and peso amounts", () => {
    // bigint inputs are already centavos: 100n is P1.00, so +P0.50 +P0.25.
    expect(sum([100n, 0.5, "0.25"])).toBe(175n);
  });

  it("sums an empty iterable to zero", () => {
    expect(sum([])).toBe(0n);
    expect(sumAmounts([])).toBe(0);
  });
});

describe("subtract / negate / absolute", () => {
  it("subtracts exactly", () => {
    expect(subtract(123456n, 23456n)).toBe(100000n);
    expect(subtract(0n, 1n)).toBe(-1n);
  });

  it("negates and absolutises", () => {
    expect(negate(500n)).toBe(-500n);
    expect(absolute(-500n)).toBe(500n);
    expect(absolute(500n)).toBe(500n);
  });
});

describe("isWithinTolerance", () => {
  it("treats an exact match as within zero tolerance", () => {
    expect(isWithinTolerance(1000n, 1000n)).toBe(true);
  });

  it("rejects one centavo under a zero tolerance", () => {
    // §8.6: a non-zero difference cannot be finalized, and one centavo is
    // non-zero. This is the regression test for exactly that.
    expect(isWithinTolerance(999n, 1000n)).toBe(false);
    expect(isWithinTolerance(1001n, 1000n)).toBe(false);
  });

  it("accepts the difference once a named tolerance allows it", () => {
    expect(isWithinTolerance(999n, 1000n, 1n)).toBe(true);
    expect(isWithinTolerance(1001n, 1000n, 1n)).toBe(true);
    expect(isWithinTolerance(998n, 1000n, 1n)).toBe(false);
  });

  it("ignores the sign of the tolerance", () => {
    expect(isWithinTolerance(999n, 1000n, -1n)).toBe(true);
  });
});

describe("formatExactCentavos", () => {
  it("renders centavos without a float round trip", () => {
    expect(formatExactCentavos(0n)).toBe("0.00");
    expect(formatExactCentavos(5n)).toBe("0.05");
    expect(formatExactCentavos(123456n)).toBe("1234.56");
    expect(formatExactCentavos(-500n)).toBe("-5.00");
  });

  it("shows a one-centavo difference as a centavo, not as zero", () => {
    // The difference is the headline number on the audit screen; rounding it
    // away would let a ₱0.01 discrepancy look reconciled.
    expect(formatExactCentavos(subtract(100_000n, 99_999n))).toBe("0.01");
  });
});

describe("roundToCentavos", () => {
  it("rounds a float to two decimals", () => {
    expect(roundToCentavos(1.005)).toBe(1.01);
    expect(roundToCentavos(1.004)).toBe(1);
    expect(roundToCentavos(8.167)).toBe(8.17);
  });

  it("leaves exact values alone", () => {
    expect(roundToCentavos(1234.56)).toBe(1234.56);
    expect(roundToCentavos(0)).toBe(0);
    expect(roundToCentavos(-45.67)).toBe(-45.67);
  });

  it("carries a rounding cascade into the pesos", () => {
    expect(roundToCentavos(9.999)).toBe(10);
  });
});

describe("assertWithinMax", () => {
  it("passes the Decimal(10, 2) ceiling exactly", () => {
    expect(() => assertWithinMax(MAX_CENTAVOS)).not.toThrow();
  });

  it("rejects one centavo past it", () => {
    expect(() => assertWithinMax(MAX_CENTAVOS + 1n)).toThrow(RangeError);
    expect(() => assertWithinMax(-(MAX_CENTAVOS + 1n))).toThrow(RangeError);
  });

  it("accepts negative balances, which are valid in the audit", () => {
    expect(() => assertWithinMax(-500n)).not.toThrow();
  });
});
describe("settleableAmount", () => {
  it("covers the whole amount when nothing is recorded yet", () => {
    expect(settleableAmount([1500], [])).toBe(150000n);
  });

  it("covers only what's outstanding, so a partly settled expense isn't paid twice", () => {
    expect(settleableAmount([1500], [600])).toBe(90000n);
    // The dangerous case: the caller passes the expense's own figure and pays
    // the full 1,500 again. This is what the function exists to prevent.
    expect(settleableAmount([1500], [1500])).toBeNull();
  });

  it("sums several prior settlements across split payouts", () => {
    expect(settleableAmount([1000], [100, 250.5, "49.49"])).toBe(60001n);
  });

  it("records nothing for a fully settled expense", () => {
    expect(settleableAmount([500], [200, 300])).toBeNull();
  });

  it("treats a centavo of leftover as rounding, not money still owed", () => {
    expect(settleableAmount([100], [99.99])).toBeNull();
  });

  it("still covers two centavos, because that's a real remainder", () => {
    expect(settleableAmount([100], [99.98])).toBe(2n);
  });

  it("records nothing when an expense is over-settled", () => {
    expect(settleableAmount([100], [120])).toBeNull();
  });

  it("keeps float inputs exact by going through centavos", () => {
    expect(settleableAmount([0.1, 0.2], [])).toBe(30n);
    expect(settleableAmount([1.005], [0.005])).toBe(100n);
  });
});
