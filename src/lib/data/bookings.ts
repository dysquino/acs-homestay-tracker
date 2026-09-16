"use server";

import { DEFAULT_CLEANING_FEE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { Booking } from "@/lib/types";

import { bookingFromDb, bookingPatchToDb, bookingToDb } from "./mappers";

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
  input: Omit<Booking, "id">,
): Promise<Booking> {
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
 * Updating a booking's check-out date keeps its untouched auto-created
 * turnover in step. Once someone marks that turnover completed, it's left
 * alone (matches the old client-side behavior).
 */
export async function updateBooking(
  id: string,
  patch: Partial<Omit<Booking, "id">>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: bookingPatchToDb(patch) });
    if (patch.checkOut !== undefined) {
      await tx.cleaningSchedule.updateMany({
        where: { bookingId: id, status: "SCHEDULED" },
        data: { date: new Date(`${patch.checkOut}T00:00:00.000Z`) },
      });
    }
  });
}

/**
 * Deleting a booking drops any turnover that was auto-created and never
 * touched, and unlinks (rather than deletes) any turnover with real work
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
      },
    });
    await tx.cleaningSchedule.updateMany({
      where: { bookingId: id },
      data: { bookingId: null },
    });
    await tx.booking.delete({ where: { id } });
  });
}
