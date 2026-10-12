import { describe, expect, it } from "vitest";

import {
  derivePaymentStatus,
  PAYMENT_TOLERANCE_CENTAVOS,
  remainingToCollect,
  wouldOverpay,
} from "../payment-status";
import type { BookingPayment } from "../types";

/** Minimal payment row — derivation only reads amount and status. */
function payment(amount: number, status: BookingPayment["status"] = "active") {
  return { amount, status };
}

describe("derivePaymentStatus", () => {
  it("is pending with no payments", () => {
    expect(derivePaymentStatus(8500, [])).toBe("pending");
  });

  it("is partial when part of the payout has arrived", () => {
    expect(derivePaymentStatus(8500, [payment(3000)])).toBe("partial");
    expect(derivePaymentStatus(8500, [payment(8499.99)])).toBe("partial");
  });

  it("is paid when the payout has arrived in full", () => {
    expect(derivePaymentStatus(8500, [payment(8500)])).toBe("paid");
  });

  it("is paid across several partial payments that add up", () => {
    // deposit + balance — the §4.2 partial-payment case that must read as paid
    expect(derivePaymentStatus(8500, [payment(3000), payment(2000), payment(3500)])).toBe("paid");
  });

  it("is overpaid when more arrives than expected", () => {
    expect(derivePaymentStatus(8500, [payment(9000)])).toBe("overpaid");
  });

  it("is overpaid by exactly one centavo", () => {
    // §4.2 requires the flag rather than silently absorbing it, and a zero
    // tolerance must not paper over the extra centavo.
    expect(derivePaymentStatus(8500, [payment(8500.01)])).toBe("overpaid");
  });

  it("sums exactly where float addition would drift", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in centavos it is 30.
    expect(derivePaymentStatus(0.3, [payment(0.1), payment(0.2)])).toBe("paid");
    expect(derivePaymentStatus(1, [payment(0.1), payment(0.2), payment(0.3), payment(0.4)])).toBe("paid");
  });

  it("ignores voided payments", () => {
    // A receipt entered in error must not count as money received.
    expect(derivePaymentStatus(8500, [payment(8500, "voided")])).toBe("pending");
    expect(derivePaymentStatus(8500, [payment(8500), payment(500, "voided")])).toBe("paid");
    expect(derivePaymentStatus(8500, [payment(5000), payment(5000, "voided")])).toBe("partial");
  });

  it("ignores refunded payments", () => {
    // A fully reversed receipt isn't received money. A partial refund is a
    // separate ExpenseSettlement and never reduces this total.
    expect(derivePaymentStatus(8500, [payment(8500, "refunded")])).toBe("pending");
  });

  it("treats a zero payout with no payments as pending, not paid", () => {
    expect(derivePaymentStatus(0, [])).toBe("pending");
  });

  it("is overpaid when any amount arrives against a zero payout", () => {
    expect(derivePaymentStatus(0, [payment(500)])).toBe("overpaid");
  });

  it("applies the same named tolerance that finalization will", () => {
    // §8.6 requires the tolerance to be applied consistently to status display
    // and finalization validation, so it lives in one exported constant.
    expect(PAYMENT_TOLERANCE_CENTAVOS).toBe(0n);
  });
});

describe("remainingToCollect", () => {
  it("returns what is still owed", () => {
    expect(remainingToCollect(8500, [payment(3000)])).toBe(5500);
  });

  it("is zero once fully paid", () => {
    expect(remainingToCollect(8500, [payment(8500)])).toBe(0);
  });

  it("goes negative on an overpayment — the excess is owed back", () => {
    expect(remainingToCollect(8500, [payment(9000)])).toBe(-500);
  });

  it("stays exact where floats would drift", () => {
    expect(remainingToCollect(0.3, [payment(0.1)])).toBe(0.2);
    expect(remainingToCollect(1, [payment(0.1), payment(0.2)])).toBe(0.7);
  });

  it("ignores voided payments", () => {
    expect(remainingToCollect(8500, [payment(8500, "voided")])).toBe(8500);
  });
});

describe("wouldOverpay", () => {
  it("warns before the total is passed", () => {
    expect(wouldOverpay(8500, [payment(8000)], 1000)).toBe(true);
  });

  it("does not warn when landing exactly on the payout", () => {
    expect(wouldOverpay(8500, [payment(8000)], 500)).toBe(false);
  });

  it("does not warn for a normal partial payment", () => {
    expect(wouldOverpay(8500, [], 3000)).toBe(false);
  });

  it("ignores voided payments when measuring what's already in", () => {
    expect(wouldOverpay(8500, [payment(9000, "voided")], 100)).toBe(false);
  });

  it("warns by exactly one centavo", () => {
    expect(wouldOverpay(8500, [], 8500.01)).toBe(true);
  });
});