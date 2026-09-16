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

    // expenseToDb/cleaningToDb only read the fields they need, so passing
    // the full seed record (which also has `id`) is fine structurally.
    for (const expense of seed.expenses) {
      await tx.expense.create({ data: expenseToDb(expense) });
    }

    for (const record of seed.cleaning) {
      const bookingId = record.bookingId
        ? (bookingIdMap.get(record.bookingId) ?? null)
        : null;
      await tx.cleaningSchedule.create({
        data: cleaningToDb({ ...record, bookingId }),
      });
    }
  });
}
