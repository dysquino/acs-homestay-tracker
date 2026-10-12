import "server-only";

import type { Prisma } from "@prisma/client";

import { dateToISO } from "./mappers";
import { ValidationError } from "@/lib/validation";

/**
 * Double bookings aren't allowed: throws if [checkIn, checkOut) overlaps any
 * other booking. A check-out and a check-in on the same day is a normal
 * turnover, not an overlap — same rule as `rangesOverlap` on the client.
 *
 * Lives outside the "use server" files on purpose: everything exported from
 * those becomes a callable endpoint.
 */
export async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  checkIn: Date,
  checkOut: Date,
  excludeId?: string,
): Promise<void> {
  const clash = await tx.booking.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { guestName: true, checkIn: true, checkOut: true },
  });
  if (clash) {
    throw new ValidationError(
      `These dates overlap ${clash.guestName} (${dateToISO(clash.checkIn)} to ${dateToISO(clash.checkOut)}). Double bookings aren't allowed.`,
    );
  }
}

/**
 * Dates the owners blocked (maintenance, own use) are closed to direct
 * bookings and guests' requests. Airbnb bookings aren't held to this: the
 * block reaches Airbnb through the calendar feed, so an Airbnb stay on those
 * dates was booked before the block and is real.
 */
export async function assertNotBlocked(
  tx: Prisma.TransactionClient,
  checkIn: Date,
  checkOut: Date,
): Promise<void> {
  const block = await tx.dateBlock.findFirst({
    where: { startDate: { lt: checkOut }, endDate: { gt: checkIn } },
    select: { reason: true, startDate: true, endDate: true },
  });
  if (block) {
    const lastDay = new Date(block.endDate.getTime() - 86_400_000);
    throw new ValidationError(
      `These dates are blocked${block.reason ? ` (${block.reason})` : ""} from ${dateToISO(block.startDate)} to ${dateToISO(lastDay)}. Remove the block first if the stay should go ahead.`,
    );
  }
}
