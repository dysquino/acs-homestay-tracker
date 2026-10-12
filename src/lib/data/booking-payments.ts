"use server";

import { prisma } from "@/lib/prisma";
import { derivePaymentStatus } from "@/lib/payment-status";
import type { BookingPayment, BookingPaymentInput } from "@/lib/types";
import { ValidationError, validateBookingPayment } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import {
  bookingPaymentFromDb,
  bookingPaymentPatchToDb,
  bookingPaymentToDb,
  dateToISO,
} from "./mappers";

/**
 * Booking receipts and expense settlements are the two tables the
 * reconciliation feature reads (§24 Phase 1). This module owns one row per
 * actual receipt of money; `expense-settlements.ts` owns the outflow side.
 *
 * Every write refreshes the booking's cached `paymentStatus` in the same
 * transaction as the payment itself (§12.1). The cache exists so the bookings
 * list doesn't need a SUM per row, but it must never drift — a payment written
 * without its status update would leave the dashboard showing "Pending" for a
 * fully paid stay, which is the exact failure §12.1 calls out.
 */

/** Receipts for one booking, newest receipt first. */
export async function listBookingPayments(bookingId: string): Promise<BookingPayment[]> {
  await requireSiteAccess();
  const rows = await prisma.bookingPayment.findMany({
    where: { bookingId },
    orderBy: { receivedDate: "desc" },
  });
  return rows.map(bookingPaymentFromDb);
}

/** Every receipt across all bookings — the future workspace's inflow pool. */
export async function listAllBookingPayments(): Promise<BookingPayment[]> {
  await requireSiteAccess();
  const rows = await prisma.bookingPayment.findMany({
    orderBy: { receivedDate: "desc" },
  });
  return rows.map(bookingPaymentFromDb);
}

export async function createBookingPayment(input: BookingPaymentInput): Promise<BookingPayment> {
  await requireSiteAccess();
  validateBookingPayment(input);
  const row = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
    const created = await tx.bookingPayment.create({ data: bookingPaymentToDb(input) });
    await refreshPaymentStatus(tx, booking.id);
    return created;
  });
  return bookingPaymentFromDb(row);
}

/**
 * An edit to a receipt. Editing an already-reconciled payment is Phase 3's
 * concern (it would need to reopen the month); until matches exist, this is a
 * plain patch.
 */
export async function updateBookingPayment(
  id: string,
  patch: Partial<BookingPaymentInput>,
): Promise<void> {
  await requireSiteAccess();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.bookingPayment.findUniqueOrThrow({ where: { id } });
    // `bookingPaymentFromDb` adds id/status/timestamps, which are all valid
    // BookingPaymentInput members, so merging the patch over the stored row
    // gives a complete input for validation.
    const merged: BookingPaymentInput = {
      bookingId: existing.bookingId,
      amount: Number(existing.amount),
      receivedDate: dateToISO(existing.receivedDate),
      method: bookingPaymentFromDb(existing).method,
      reference: existing.reference,
      notes: existing.notes,
      createdBy: existing.createdBy,
      ...patch,
    };
    validateBookingPayment(merged);
    await tx.bookingPayment.update({ where: { id }, data: bookingPaymentPatchToDb(patch) });
    await refreshPaymentStatus(tx, existing.bookingId);
  });
}

/**
 * Void a receipt rather than deleting it (§7.13: a financial row that has
 * appeared anywhere must stay visible). The booking's status is recomputed so a
 * voided payment stops counting toward "received".
 */
export async function voidBookingPayment(id: string, voidedBy: string): Promise<void> {
  await requireSiteAccess();
  if (!voidedBy.trim()) throw new ValidationError("Voided by is required.");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.bookingPayment.findUniqueOrThrow({ where: { id } });
    if (existing.status === "VOIDED") return; // idempotent — voiding twice isn't an error
    await tx.bookingPayment.update({
      where: { id },
      data: { status: "VOIDED", voidedAt: new Date(), voidedBy },
    });
    await refreshPaymentStatus(tx, existing.bookingId);
  });
}

/**
 * Recompute and store a booking's cached `paymentStatus` from its ACTIVE
 * payments (§12.1). Takes the transaction client so it composes with whatever
 * else the caller is writing.
 */
async function refreshPaymentStatus(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
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