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
