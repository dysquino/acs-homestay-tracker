"use server";

import { prisma } from "@/lib/prisma";
import { buildSeedData } from "@/lib/seed";

import { bookingToDb, cleaningToDb, expenseToDb } from "./mappers";

/**
 * Wipes and reseeds the three tables with the same sample dataset the
 * frontend used to reset to when everything lived in localStorage. Sample
 * bookings reference each other by placeholder ids (`bk_1`, ...) — those
 * get remapped to the real generated ids as rows are inserted.
 */
export async function resetSampleData(): Promise<void> {
  const seed = buildSeedData();

  await prisma.$transaction(async (tx) => {
    await tx.cleaningSchedule.deleteMany({});
    await tx.expense.deleteMany({});
    await tx.booking.deleteMany({});

    const bookingIdMap = new Map<string, string>();
    for (const { id, ...rest } of seed.bookings) {
      const created = await tx.booking.create({ data: bookingToDb(rest) });
      bookingIdMap.set(id, created.id);
    }

    for (const { id: _id, ...rest } of seed.expenses) {
      await tx.expense.create({ data: expenseToDb(rest) });
    }

    for (const { id: _id, ...rest } of seed.cleaning) {
      const bookingId = rest.bookingId
        ? (bookingIdMap.get(rest.bookingId) ?? null)
        : null;
      await tx.cleaningSchedule.create({
        data: cleaningToDb({ ...rest, bookingId }),
      });
    }
  });
}
