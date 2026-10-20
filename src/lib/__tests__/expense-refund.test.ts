import { describe, expect, it } from "vitest";

import { expenseRefundStatusAfterPayoutChange } from "../expense-refund";
import type { ExpenseRefundStatus } from "../types";

/**
 * The policy in one place: an expense's refund status follows the money that
 * has been paid out of it, and only in one direction unless a reimbursement
 * was taken back.
 */
function status(over: {
  amount?: number | string;
  previousAmount?: number | string;
  paidBy?: string;
  stored?: ExpenseRefundStatus;
  before?: (number | string)[];
  after?: (number | string)[];
  settlementType?: "owner_reimbursement" | "direct_vendor_payment" | "other";
}) {
  return expenseRefundStatusAfterPayoutChange({
    amount: over.amount ?? 1000,
    previousAmount: over.previousAmount,
    paidBy: over.paidBy ?? "DK",
    stored: over.stored ?? "owed",
    before: over.before ?? [],
    after: over.after ?? [],
    settlementType: over.settlementType,
  });
}

describe("expenseRefundStatusAfterPayoutChange", () => {
  it("marks an expense refunded once it is paid out in full", () => {
    // The rule the feature is for: nobody is owed after the money has gone.
    expect(status({ before: [], after: [1000] })).toBe("refunded");
  });

  it("marks it refunded when the payouts add up to the full amount", () => {
    expect(status({ before: [400], after: [400, 600] })).toBe("refunded");
  });

  it("leaves it owed while money is still outstanding", () => {
    expect(status({ before: [], after: [600] })).toBe("owed");
  });

  it("leaves it owed when nothing has been paid out at all", () => {
    expect(status({ stored: "owed" })).toBe("owed");
  });

  it("leaves an expense that was never owed alone", () => {
    // Paid straight from the bank account: "refunded" means nobody is owed,
    // and a part-paid expense keeps that meaning.
    expect(status({ stored: "refunded", after: [600] })).toBe("refunded");
  });

  it("treats a one-centavo remainder as paid in full", () => {
    // The same centavo rule the rest of the money code uses — a leftover that
    // small is rounding, not money still owed.
    expect(status({ before: [], after: [999.99] })).toBe("refunded");
  });

  it("puts the claim back when the reimbursement that settled it is taken back", () => {
    // Voiding the payout that paid someone back means they have not been paid
    // back, so the expense is owed again.
    expect(
      status({
        stored: "refunded",
        before: [1000],
        after: [],
        settlementType: "owner_reimbursement",
      }),
    ).toBe("owed");
  });

  it("puts the claim back when the settling reimbursement is shrunk", () => {
    expect(
      status({
        stored: "refunded",
        before: [1000],
        after: [600],
        settlementType: "owner_reimbursement",
      }),
    ).toBe("owed");
  });

  it("leaves a voided vendor payment alone", () => {
    // Money that went to a vendor leaves an expense without a payout date —
    // the payout worklist chases that in its own words. It does not make
    // anyone out of pocket.
    expect(
      status({
        stored: "refunded",
        before: [1000],
        after: [],
        settlementType: "direct_vendor_payment",
      }),
    ).toBe("refunded");
  });

  it("never makes a bank-paid expense owed", () => {
    // The validator rejects "owed" on a bank-paid expense, so writing it
    // would make the row impossible to edit.
    expect(
      status({
        paidBy: "Bank",
        stored: "refunded",
        before: [1000],
        after: [],
        settlementType: "owner_reimbursement",
      }),
    ).toBe("refunded");
  });

  it("keeps the row's claim when the amount moves and no payout was touched", () => {
    // A bigger bill is a missing payout date, not a reversed reimbursement.
    expect(
      status({
        amount: 1500,
        previousAmount: 1000,
        stored: "refunded",
        before: [1000],
        after: [1000],
      }),
    ).toBe("refunded");
  });

  it("measures what came before against the amount the expense had then", () => {
    // The amount moved up and the payout was taken back: the reimbursement
    // had settled the expense as it was, and now it hasn't been paid at all.
    expect(
      status({
        amount: 1500,
        previousAmount: 1000,
        stored: "refunded",
        before: [1000],
        after: [],
        settlementType: "owner_reimbursement",
      }),
    ).toBe("owed");
  });

  it("stays exact where float addition would drift", () => {
    expect(status({ amount: 0.3, before: [], after: [0.1, 0.2] })).toBe("refunded");
  });
});
