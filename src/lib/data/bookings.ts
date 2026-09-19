"use server";

import { DEFAULT_CLEANING_FEE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Booking, BookingInput } from "@/lib/types";
import { validateBooking } from "@/lib/validation";

import {
  bookingFromDb,
  bookingPatchToDb,
  bookingToDb,
  isoToDate,
} from "./mappers";

export async function listBookings(): Promise<Booking[]> {
  const rows = await prisma.booking.findMany({ orderBy: { checkIn: "asc" } });
  return rows.map(bookingFromDb);
}

/**
 * Creates a booking and its auto-suggested turnover cleaning (scheduled for
 * the check-out date) in one transaction — a confirmed requirement, ported
 * as-is from the old client-side store. The user can reassign or delete the
 * turnover afterward.
 */
export async function createBooking(
  input: BookingInput,
): Promise<Booking> {
  validateBooking(input);
  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({ data: bookingToDb(input) });
    await tx.cleaningSchedule.create({
      data: {
        date: created.checkOut,
        bookingId: created.id,
        cleanerName: "",
        status: "SCHEDULED",
        paymentAmount: DEFAULT_CLEANING_FEE,
        paymentStatus: "UNPAID",
        notes: "",
        createdBy: created.createdBy,
      },
    });
    return created;
  });
  return bookingFromDb(booking);
}

/**
 * When a booking's check-out date actually changes, the turnover cleaning
 * that was sitting on the old check-out date moves with it. A cleaning
 * someone rescheduled by hand (date no longer equals the old check-out), or
 * one already completed, is left alone — so editing an unrelated field such
 * as the payment status never touches the cleaning schedule.
 */
export async function updateBooking(
  id: string,
  patch: Partial<BookingInput>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUniqueOrThrow({ where: { id } });
    const current = bookingFromDb(existing);
    validateBooking({ ...current, ...patch });

    await tx.booking.update({ where: { id }, data: bookingPatchToDb(patch) });

    if (patch.checkOut !== undefined && patch.checkOut !== current.checkOut) {
      const moved = await tx.cleaningSchedule.findMany({
        where: { bookingId: id, status: "SCHEDULED", date: existing.checkOut },
        select: { id: true },
      });
      const ids = moved.map((c) => c.id);
      const date = isoToDate(patch.checkOut);
      await tx.cleaningSchedule.updateMany({ where: { id: { in: ids } }, data: { date } });
      // A prepaid cleaning's expense is dated on the cleaning; move it too.
      await tx.expense.updateMany({ where: { cleaningId: { in: ids } }, data: { date } });
    }
  });
}

/**
 * Deleting a booking drops any turnover that was auto-created and never
 * touched (no cleaner, no notes), and unlinks (rather than deletes) any turnover with real work
 * recorded against it — same rule as the old client-side store.
 */
export async function deleteBooking(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.cleaningSchedule.deleteMany({
      where: {
        bookingId: id,
        status: "SCHEDULED",
        paymentStatus: "UNPAID",
        cleanerName: "",
        notes: "",
      },
    });
    await tx.cleaningSchedule.updateMany({
      where: { bookingId: id },
      data: { bookingId: null },
    });
    await tx.booking.delete({ where: { id } });
  });
}
