"use server";

import { prisma } from "@/lib/prisma";
import type { Booking, BookingInput } from "@/lib/types";
import { validateBooking } from "@/lib/validation";

import {
  bookingFromDb,
  bookingPatchToDb,
  isoToDate,
} from "./mappers";
import { requireSiteAccess } from "./access";
import { createBookingWithTurnover } from "./booking-create";
import { assertNoOverlap } from "./overlap";

export async function listBookings(): Promise<Booking[]> {
  await requireSiteAccess();
  const rows = await prisma.booking.findMany({ orderBy: { checkIn: "asc" } });
  return rows.map(bookingFromDb);
}

/** A booking plus its turnover cleaning, in one transaction (see booking-create.ts). */
export async function createBooking(
  input: BookingInput,
): Promise<Booking> {
  await requireSiteAccess();
  validateBooking(input);
  const booking = await prisma.$transaction((tx) => createBookingWithTurnover(tx, input));
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
  await requireSiteAccess();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUniqueOrThrow({ where: { id } });
    const current = bookingFromDb(existing);
    const next = { ...current, ...patch };
    validateBooking(next);
    // Only when the dates move, so a booking that overlapped from before
    // double bookings were blocked can still have its payment etc. updated.
    if (next.checkIn !== current.checkIn || next.checkOut !== current.checkOut) {
      await assertNoOverlap(tx, isoToDate(next.checkIn), isoToDate(next.checkOut), id);
    }

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
 *
 * `withCleanings` deletes every linked cleaning instead — for a cancelled
 * stay whose (e.g. imported, pre-paid) cleaning never happened. A paid
 * cleaning's expense goes with it via the schema's onDelete: Cascade.
 */
export async function deleteBooking(
  id: string,
  { withCleanings = false }: { withCleanings?: boolean } = {},
): Promise<void> {
  await requireSiteAccess();
  await prisma.$transaction(async (tx) => {
    if (withCleanings) {
      await tx.cleaningSchedule.deleteMany({ where: { bookingId: id } });
    }
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
