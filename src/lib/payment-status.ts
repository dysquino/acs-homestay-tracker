import { isWithinTolerance, subtract, sum, toCentavos } from "./finance";
import type { BookingPayment, PaymentStatus } from "./types";

/**
 * How close received money must land to `totalPayout` to count as fully paid.
 *
 * Zero by design: §8.6 makes an exact-centavo difference the default for both
 * finalization and this derivation, so "paid" and "ties out" mean the same
 * thing. Named as a constant anyway so that a future tolerance (§8.6 allows one
 * as long as it's named and applied consistently) has an obvious home — and so
 * the tolerance is applied identically here and at finalization, never in one
 * place only.
 */
export const PAYMENT_TOLERANCE_CENTAVOS = 0n;

/**
 * Derive a booking's payment status from its payment rows.
 *
 * §12.1 makes `paymentStatus` a cache of this calculation, not an input. The
 * booking's own field is never trusted for reconciliation; callers pass the
 * rows.
 *
 * Only ACTIVE payments count — a VOIDED one was entered in error, and a
 * REFUNDED one has been handed back (a partial refund is a separate
 * ExpenseSettlement instead, so it never reduces the received total here).
 */
export function derivePaymentStatus(
  totalPayout: number,
  payments: Pick<BookingPayment, "amount" | "status">[],
): PaymentStatus {
  const expected = toCentavos(totalPayout);
  const received = sum(
    payments.filter((p) => p.status === "active").map((p) => p.amount),
  );
  const delta = subtract(received, expected);

  if (received === 0n) return "pending";
  if (delta < 0n) return "partial";
  if (isWithinTolerance(received, expected, PAYMENT_TOLERANCE_CENTAVOS)) return "paid";
  return "overpaid";
}

/**
 * What still needs collecting on a booking, in pesos. Zero once fully paid;
 * negative when overpaid, because the excess is money owed back rather than
 * money still expected. Never a centavo of float drift — computed in centavos.
 */
export function remainingToCollect(totalPayout: number, payments: Pick<BookingPayment, "amount" | "status">[]): number {
  const expected = toCentavos(totalPayout);
  const received = sum(payments.filter((p) => p.status === "active").map((p) => p.amount));
  const remaining = subtract(expected, received);
  const asNumber = Number(remaining) / 100;
  return remaining < 0n ? -Math.abs(asNumber) : asNumber;
}

/**
 * Whether a new payment of `amount` would take the booking past its payout.
 *
 * §4.2 requires an overpayment to be flagged rather than silently absorbed, so
 * the booking-payment form uses this to warn before saving rather than after.
 * The write itself stays permissive — a legitimate overpayment (a guest paying
 * a rounded-up total, a second booking's deposit landing early) must be
 * recordable — it just has to be visible.
 */
export function wouldOverpay(
  totalPayout: number,
  existingPayments: Pick<BookingPayment, "amount" | "status">[],
  newAmount: number,
): boolean {
  const expected = toCentavos(totalPayout);
  const already = sum(existingPayments.filter((p) => p.status === "active").map((p) => p.amount));
  const after = already + toCentavos(newAmount);
  return after > expected;
}