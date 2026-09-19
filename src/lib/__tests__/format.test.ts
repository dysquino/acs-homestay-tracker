import { describe, expect, it } from "vitest";

import { formatCurrency, formatSigned, formatWhole } from "../format";

describe("money formatting", () => {
  it("shows centavos when there are some, so rows add up to their total", () => {
    expect(formatCurrency(1234.5)).toBe("₱1,234.50");
    expect(formatCurrency(0.4)).toBe("₱0.40");
    expect(formatCurrency(0.4 + 0.4)).toBe("₱0.80");
  });

  it("shows whole pesos when there are none", () => {
    expect(formatCurrency(1235)).toBe("₱1,235");
  });

  it("ignores floating-point dust", () => {
    expect(formatCurrency(0.1 + 0.2)).toBe("₱0.30");
    expect(formatCurrency(1000.0000000001)).toBe("₱1,000");
  });

  it("rounds computed figures to whole pesos", () => {
    expect(formatWhole(23587.33)).toBe("₱23,587");
    expect(formatSigned(-1234.6)).toBe("−₱1,235");
  });
});
