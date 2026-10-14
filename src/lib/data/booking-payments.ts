"use server";

import { prisma } from "@/lib/prisma";
import { derivePaymentStatus } from "@/lib/payment-status";
import { requireReconciliationEnabled } from "./reconciliation-status";
import type { BookingPayment, BookingPaymentInput } from "@/lib/types";
import { ValidationError, validateBookingPayment } from "@/lib/validation";
import { validatePaymentScreenshot } from "@/lib/payment-screenshot";

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
  await requireReconciliationEnabled();
  const rows = await prisma.bookingPayment.findMany({
    where: { bookingId },
    orderBy: { receivedDate: "desc" },
    omit: { paymentScreenshot: true },
  });
  return rows.map(bookingPaymentFromDb);
}

/** Every receipt across all bookings — the future workspace's inflow pool. */
export async function listAllBookingPayments(): Promise<BookingPayment[]> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  const rows = await prisma.bookingPayment.findMany({
    orderBy: { receivedDate: "desc" },
    omit: { paymentScreenshot: true },
  });
  return rows.map(bookingPaymentFromDb);
}

export async function createBookingPayment(
  input: BookingPaymentInput,
  paymentScreenshot: Uint8Array,
): Promise<BookingPayment> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  validateBookingPayment(input);
  const screenshot = validatePaymentScreenshot(paymentScreenshot);
  if (!screenshot.ok) throw new ValidationError(screenshot.error);
  const row = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
    const created = await tx.bookingPayment.create({
      data: {
        ...bookingPaymentToDb(input),
        paymentScreenshot: Buffer.from(paymentScreenshot),
        paymentScreenshotMime: screenshot.mime,
      },
    });
    await refreshPaymentStatus(tx, booking.id);
    return created;
  });
  return bookingPaymentFromDb(row);
}

export type BookingPaymentScreenshotData = { mime: string; bytes: Uint8Array };

/** Fetch proof only when the owner opens it; payment lists return only a flag. */
export async function getBookingPaymentScreenshot(
  paymentId: string,
): Promise<BookingPaymentScreenshotData | null> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  const row = await prisma.bookingPayment.findUnique({
    where: { id: paymentId },
    select: { paymentScreenshot: true, paymentScreenshotMime: true },
  });
  if (!row?.paymentScreenshot || !row.paymentScreenshotMime) return null;
  return { mime: row.paymentScreenshotMime, bytes: row.paymentScreenshot };
}

/** Attach or replace proof, including on a historical payment. */
export async function attachBookingPaymentScreenshot(
  paymentId: string,
  bytes: Uint8Array,
): Promise<{ mime: string } | { error: string }> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  const validation = validatePaymentScreenshot(bytes);
  if (!validation.ok) return { error: validation.error };
  await prisma.bookingPayment.update({
    where: { id: paymentId },
    data: {
      paymentScreenshot: Buffer.from(bytes),
      paymentScreenshotMime: validation.mime,
    },
  });
  return { mime: validation.mime };
}

export async function clearBookingPaymentScreenshot(paymentId: string): Promise<void> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  await prisma.bookingPayment.update({
    where: { id: paymentId },
    data: { paymentScreenshot: null, paymentScreenshotMime: null },
  });
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
  await requireReconciliationEnabled();
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
  await requireReconciliationEnabled();
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
