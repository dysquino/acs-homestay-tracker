import "server-only";

import type { Prisma } from "@prisma/client";

import { derivePaymentStatus } from "@/lib/payment-status";
import type { BookingPayment } from "@/lib/types";

/**
 * Recompute and store a booking's cached `paymentStatus` from its ACTIVE
 * payments (§12.1). Takes the transaction client so it composes with whatever
 * else the caller is writing.
 *
 * Returns without writing when the booking has no payment rows at all. The
 * existing bookings were all marked paid back when `paymentStatus` was a
 * hand-picked dropdown (§12.2), and none of them have receipts recorded against
 * them — so "no payments" means "not entered yet", not "nothing received".
 * Deriving "pending" from that would silently flip every historical booking to
 * unpaid the first time any payment was added anywhere in the system. Only
 * recompute once a booking actually has payments; §12.2 deliberately treats
 * pre-reconciliation history as covered by the opening balance rather than
 * backfilled with invented receipt dates.
 *
 * Lives here rather than in `booking-payments.ts` because that file is a
 * "use server" module, which may only export async functions — and because the
 * approval flow (booking-requests.ts) needs the same derivation when it
 * records a deposit as part of creating the booking.
 */
export async function refreshPaymentStatus(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { totalPayout: true },
  });
  const payments = await tx.bookingPayment.findMany({
    where: { bookingId },
    select: { amount: true, status: true },
  });
  if (payments.length === 0) return; // see the note above — don't overwrite history
  // Decimal -> number at this boundary only: derivePaymentStatus re-widens to
  // bigint centavos via toCentavos, so the float never does arithmetic.
  const derived = derivePaymentStatus(
    Number(booking.totalPayout),
    payments.map((p) => ({ amount: Number(p.amount), status: p.status.toLowerCase() as BookingPayment["status"] })),
  );
  const toDb =
    derived === "paid" ? "PAID" : derived === "partial" ? "PARTIAL" : derived === "overpaid" ? "OVERPAID" : "PENDING";
  await tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: toDb } });
}
