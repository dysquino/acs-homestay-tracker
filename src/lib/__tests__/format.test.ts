import { describe, expect, it } from "vitest";

import { formatAccountNumber, formatCurrency, formatSigned, formatWhole } from "../format";

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

describe("formatAccountNumber", () => {
  it("groups digits in fours from the left", () => {
    expect(formatAccountNumber("109420670200")).toBe("1094 2067 0200");
  });

  it("strips anything that isn't a digit before formatting", () => {
    expect(formatAccountNumber("1094 2067 0200")).toBe("1094 2067 0200");
    expect(formatAccountNumber("1094-2067-0200")).toBe("1094 2067 0200");
  });

  it("leaves short numbers as-is when fewer than four digits", () => {
    expect(formatAccountNumber("123")).toBe("123");
  });

  it("does not add a trailing space when length is not a multiple of four", () => {
    expect(formatAccountNumber("12345")).toBe("1234 5");
    expect(formatAccountNumber("1234567890")).toBe("1234 5678 90");
  });
});
