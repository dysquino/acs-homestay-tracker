import { describe, expect, it } from "vitest";

import { expenseOutstandingAmount, expensePayoutSummary } from "../expense-payout";

describe("expenseOutstandingAmount", () => {
  it("calculates the exact balance after prior installments", () => {
    expect(expenseOutstandingAmount(12_000, 4_000)).toBe(8_000);
    expect(expenseOutstandingAmount(0.3, 0.2)).toBe(0.1);
  });

  it("returns zero when no further payout should be recorded", () => {
    expect(expenseOutstandingAmount(12_000, 12_000)).toBe(0);
    expect(expenseOutstandingAmount(12_000, 13_000)).toBe(0);
  });
});

describe("expensePayoutSummary", () => {
  it("offers the full expense amount for the first payout", () => {
    expect(expensePayoutSummary(12_000, [])).toEqual({
      settled: 0,
      outstanding: 12_000,
      fullySettled: false,
    });
  });

  it("offers only the balance after installment payments", () => {
    expect(
      expensePayoutSummary(12_000, [
        { amount: 2_000, status: "active" },
        { amount: 2_000, status: "active" },
      ]),
    ).toEqual({
      settled: 4_000,
      outstanding: 8_000,
      fullySettled: false,
    });
  });

  it("does not count voided payouts", () => {
    expect(
      expensePayoutSummary(12_000, [
        { amount: 2_000, status: "active" },
        { amount: 2_000, status: "voided" },
      ]),
    ).toEqual({
      settled: 2_000,
      outstanding: 10_000,
      fullySettled: false,
    });
  });

  it("stops offering payouts once the expense is fully settled", () => {
    expect(
      expensePayoutSummary(12_000, [
        { amount: 2_000, status: "active" },
        { amount: 10_000, status: "active" },
      ]),
    ).toEqual({
      settled: 12_000,
      outstanding: 0,
      fullySettled: true,
    });
  });

  it("keeps centavo arithmetic exact across installments", () => {
    expect(
      expensePayoutSummary(0.3, [
        { amount: 0.1, status: "active" },
        { amount: 0.1, status: "active" },
      ]),
    ).toEqual({
      settled: 0.2,
      outstanding: 0.1,
      fullySettled: false,
    });
  });
});
