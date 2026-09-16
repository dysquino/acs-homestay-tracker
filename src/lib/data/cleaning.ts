"use server";

import { prisma } from "@/lib/prisma";
import type { CleaningRecord } from "@/lib/types";

import { cleaningFromDb, cleaningPatchToDb, cleaningToDb } from "./mappers";

export async function listCleaning(): Promise<CleaningRecord[]> {
  const rows = await prisma.cleaningSchedule.findMany({
    orderBy: { date: "desc" },
  });
  return rows.map(cleaningFromDb);
}

export async function createCleaning(
  input: Omit<CleaningRecord, "id">,
): Promise<CleaningRecord> {
  const row = await prisma.cleaningSchedule.create({
    data: cleaningToDb(input),
  });
  return cleaningFromDb(row);
}

export async function updateCleaning(
  id: string,
  patch: Partial<Omit<CleaningRecord, "id">>,
): Promise<void> {
  await prisma.cleaningSchedule.update({
    where: { id },
    data: cleaningPatchToDb(patch),
  });
}

export async function deleteCleaning(id: string): Promise<void> {
  await prisma.cleaningSchedule.delete({ where: { id } });
}
