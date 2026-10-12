import "server-only";

import type { Prisma } from "@prisma/client";

import { DEFAULT_CLEANING_FEE } from "@/lib/constants";
import type { BookingInput } from "@/lib/types";

import { bookingToDb, isoToDate } from "./mappers";
import { assertNoOverlap, assertNotBlocked } from "./overlap";

/**
 * Creates a booking and its auto-suggested turnover cleaning (scheduled for
 * the check-out date) — a confirmed requirement, ported as-is from the old
 * client-side store; the user can reassign or delete the turnover afterward.
 * Refuses overlapping dates (no double bookings), and blocked dates for a
 * direct booking. Shared by the owners' form
 * and approving a guest's request, so both get the same rules.
 */
export async function createBookingWithTurnover(tx: Prisma.TransactionClient, input: BookingInput) {
  await assertNoOverlap(tx, isoToDate(input.checkIn), isoToDate(input.checkOut));
  if (input.source === "direct") await assertNotBlocked(tx, isoToDate(input.checkIn), isoToDate(input.checkOut));
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
}
