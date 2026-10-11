import "server-only";

import { prisma } from "@/lib/prisma";
import type { ISODate } from "@/lib/types";

import { dateToISO, isoToDate } from "./mappers";

export type BookedRange = { checkIn: ISODate; checkOut: ISODate };

/**
 * Which nights are taken from `today` on — dates only. This is everything
 * the guests' booking page gets to know: no names, amounts or anything else.
 */
export async function getBookedRanges(today: ISODate): Promise<BookedRange[]> {
  const rows = await prisma.booking.findMany({
    where: { checkOut: { gt: isoToDate(today) } },
    select: { checkIn: true, checkOut: true },
    orderBy: { checkIn: "asc" },
  });
  return rows.map((r) => ({ checkIn: dateToISO(r.checkIn), checkOut: dateToISO(r.checkOut) }));
}
