"use server";

import { prisma } from "@/lib/prisma";
import type { CleaningRecord } from "@/lib/types";
import { validateCleaning } from "@/lib/validation";

import { syncCleaningExpense } from "./cleaning-expense";
import { cleaningFromDb, cleaningPatchToDb, cleaningToDb } from "./mappers";

export async function listCleaning(): Promise<CleaningRecord[]> {
  const rows = await prisma.cleaningSchedule.findMany({
    orderBy: { date: "desc" },
  });
  return rows.map(cleaningFromDb);
}

/**
 * A cleaning saved as Paid gets its expense straight away (see
 * cleaning-expense.ts); `createdBy` is who is recorded as having paid.
 */
export async function createCleaning(
  input: Omit<CleaningRecord, "id">,
): Promise<CleaningRecord> {
  validateCleaning(input);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.cleaningSchedule.create({
      data: cleaningToDb(input),
    });
    await syncCleaningExpense(tx, created, input.createdBy);
    return created;
  });
  return cleaningFromDb(row);
}

/**
 * `actor` is who is making this change — recorded as the payer if this edit
 * is what marks the cleaning paid.
 */
export async function updateCleaning(
  id: string,
  patch: Partial<Omit<CleaningRecord, "id">>,
  actor: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.cleaningSchedule.findUniqueOrThrow({
      where: { id },
    });
    validateCleaning({ ...cleaningFromDb(existing), ...patch });

    const row = await tx.cleaningSchedule.update({
      where: { id },
      data: cleaningPatchToDb(patch),
    });
    await syncCleaningExpense(tx, row, actor);
  });
}

/** Its linked expense (if any) goes with it — cascade in the schema. */
export async function deleteCleaning(id: string): Promise<void> {
  await prisma.cleaningSchedule.delete({ where: { id } });
}
