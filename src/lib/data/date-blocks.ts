"use server";

import { validateDateBlock } from "@/lib/date-blocks";
import { prisma } from "@/lib/prisma";
import type { DateBlock, DateBlockInput } from "@/lib/types";
import { ValidationError } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import { airbnbBlocks } from "./airbnb-calendar";
import { dateBlockFromDb, dateToISO, isoToDate } from "./mappers";

export type BlockResult = { ok: true; block: DateBlock } | { ok: false; error: string };

export async function listDateBlocks(): Promise<DateBlock[]> {
  await requireSiteAccess();
  const rows = await prisma.dateBlock.findMany({ orderBy: { startDate: "asc" } });
  return rows.map(dateBlockFromDb);
}

/**
 * Closes dates with no guest. Refused when a booking (either source), an
 * Airbnb reservation not imported yet, or another block is already on them —
 * those nights are taken anyway, and a block on top would only hide the stay.
 * Returns an error rather than throwing so the owner sees why.
 */
export async function createDateBlock(input: DateBlockInput): Promise<BlockResult> {
  await requireSiteAccess();
  try {
    const data: DateBlockInput = {
      checkIn: String(input?.checkIn ?? ""),
      checkOut: String(input?.checkOut ?? ""),
      reason: String(input?.reason ?? "").trim(),
      createdBy: String(input?.createdBy ?? "").trim().slice(0, 200) || "Unknown",
    };
    validateDateBlock(data);
    const start = isoToDate(data.checkIn);
    const end = isoToDate(data.checkOut);

    // Before the transaction: this may read Airbnb's feed over the network.
    const { blocks: airbnb } = await airbnbBlocks();
    const airbnbClash = airbnb.find((r) => r.checkIn < data.checkOut && data.checkIn < r.checkOut);
    if (airbnbClash) {
      throw new ValidationError(
        `An Airbnb reservation (${airbnbClash.checkIn} to ${airbnbClash.checkOut}) is already on these dates.`,
      );
    }

    const row = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { checkIn: { lt: end }, checkOut: { gt: start } },
        select: { guestName: true, checkIn: true, checkOut: true },
      });
      if (booking) {
        throw new ValidationError(
          `${booking.guestName} is booked on these dates (${dateToISO(booking.checkIn)} to ${dateToISO(booking.checkOut)}).`,
        );
      }
      const other = await tx.dateBlock.findFirst({
        where: { startDate: { lt: end }, endDate: { gt: start } },
        select: { id: true },
      });
      if (other) throw new ValidationError("Some of these dates are already blocked.");
      return tx.dateBlock.create({
        data: { startDate: start, endDate: end, reason: data.reason, createdBy: data.createdBy },
      });
    });
    return { ok: true, block: dateBlockFromDb(row) };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Reopens the dates. Deleting one that's already gone is fine. */
export async function deleteDateBlock(id: string): Promise<void> {
  await requireSiteAccess();
  await prisma.dateBlock.deleteMany({ where: { id: String(id) } });
}
