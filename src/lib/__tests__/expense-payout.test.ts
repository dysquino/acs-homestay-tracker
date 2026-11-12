import { describe, expect, it } from "vitest";

import {
  expenseOutstandingAmount,
  expenseOutstandingExcluding,
  expensePayoutSummary,
  expensePayoutView,
} from "../expense-payout";

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

describe("expensePayoutView", () => {
  it("says a bank-paid expense left the bank in full, even with nothing recorded", () => {
    // The bank paid it, so the money went. What is missing is the date it
    // went on — not the money.
    expect(expensePayoutView(7_242.64, [], "Bank")).toEqual({
      leftTheBank: 7_242.64,
      outstanding: 7_242.64,
      paidByBank: true,
      recorded: false,
      fullySettled: false,
    });
  });

  it("still offers the amount to date for a bank-paid expense", () => {
    // Zeroing the outstanding would make the payout form offer ₱0.
    expect(expensePayoutView(7_242.64, [], "Bank").outstanding).toBe(7_242.64);
  });

  it("keeps an owner-fronted expense on what its settlements say", () => {
    expect(
      expensePayoutView(1_000, [{ amount: 400, status: "active" }], "DK"),
    ).toEqual({
      leftTheBank: 400,
      outstanding: 600,
      paidByBank: false,
      recorded: true,
      fullySettled: false,
    });
  });

  it("does not count a voided payout as recorded", () => {
    const view = expensePayoutView(1_000, [{ amount: 1_000, status: "voided" }], "Bank");
    expect(view.recorded).toBe(false);
    expect(view.fullySettled).toBe(false);
  });

  it("calls a bank-paid expense with a recorded payout fully settled", () => {
    expect(expensePayoutView(1_000, [{ amount: 1_000, status: "active" }], "Bank")).toMatchObject({
      fullySettled: true,
      recorded: true,
    });
  });
});

describe("expenseOutstandingExcluding", () => {
  /**
   * The outstanding an EDIT is measured against.
   *
   * The settlement being edited is being replaced, not added to, so it has to
   * be left out of the sum. Counting it made the outstanding read as ₱0 on an
   * already-settled expense, and the edit form then refused every change with
   * "Cannot exceed the ₱0.00 remaining balance."
   */
  it("leaves the settlement being edited out of the balance", () => {
    const settlements = [{ id: "a", amount: 1_000, status: "active" as const }];
    expect(expenseOutstandingExcluding(1_000, settlements, "a")).toBe(1_000);
  });

  it("keeps the other settlements in the balance", () => {
    const settlements = [
      { id: "a", amount: 1_000, status: "active" as const },
      { id: "b", amount: 500, status: "active" as const },
    ];
    // ₱2,000 expense, ₱500 still recorded besides the one being edited.
    expect(expenseOutstandingExcluding(2_000, settlements, "a")).toBe(1_500);
  });

  it("does not count a voided settlement toward the balance", () => {
    const settlements = [
      { id: "a", amount: 1_000, status: "active" as const },
      { id: "b", amount: 300, status: "voided" as const },
    ];
    // Only the voided one is left, so the whole amount can still be recorded.
    expect(expenseOutstandingExcluding(2_000, settlements, "a")).toBe(2_000);
  });

  it("behaves like the plain outstanding when nothing is excluded", () => {
    const settlements = [{ id: "a", amount: 400, status: "active" as const }];
    expect(expenseOutstandingExcluding(1_000, settlements, null)).toBe(600);
  });
});
