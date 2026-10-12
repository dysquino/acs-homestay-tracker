import "server-only";

import { prisma } from "@/lib/prisma";
import type { ISODate } from "@/lib/types";

import { airbnbBlocks } from "./airbnb-calendar";
import { dateToISO, isoToDate } from "./mappers";

export type BookedRange = { checkIn: ISODate; checkOut: ISODate };

/**
 * Which nights are taken from `today` on — the app's bookings, the owners'
 * blocked dates, and Airbnb reservations not imported yet. Dates only: this is everything the guests'
 * booking page gets to know — no names, codes, amounts or anything else.
 */
export async function getBookedRanges(today: ISODate): Promise<BookedRange[]> {
  const [rows, closed, { blocks }] = await Promise.all([
    prisma.booking.findMany({
      where: { checkOut: { gt: isoToDate(today) } },
      select: { checkIn: true, checkOut: true },
    }),
    prisma.dateBlock.findMany({
      where: { endDate: { gt: isoToDate(today) } },
      select: { startDate: true, endDate: true },
    }),
    airbnbBlocks(),
  ]);
  return [
    ...rows.map((r) => ({ checkIn: dateToISO(r.checkIn), checkOut: dateToISO(r.checkOut) })),
    // Shown to guests the same as a booking — no reason, just "booked".
    ...closed.map((r) => ({ checkIn: dateToISO(r.startDate), checkOut: dateToISO(r.endDate) })),
    ...blocks.map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut })),
  ].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
