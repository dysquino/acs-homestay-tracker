"use server";

import { prisma } from "@/lib/prisma";
import { requireSiteAccess } from "@/lib/data/access";
import type { RoomStatus } from "@/lib/types";

/** Prisma enum values (UPPER_SNAKE_CASE) — translate to/from the domain type. */
const DB_TO_STATUS: Record<string, RoomStatus> = {
  CLEAN: "clean",
  DIRTY: "dirty",
  IN_USE: "in_use",
};
const STATUS_TO_DB: Record<RoomStatus, string> = {
  clean: "CLEAN",
  dirty: "DIRTY",
  in_use: "IN_USE",
};

export async function getRoomStatus(): Promise<RoomStatus> {
  await requireSiteAccess();
  const row = await prisma.paymentConfig.findUnique({
    where: { id: "singleton" },
    select: { roomStatus: true },
  });
  return DB_TO_STATUS[row?.roomStatus ?? "CLEAN"] ?? "clean";
}

export async function setRoomStatus(status: RoomStatus): Promise<void> {
  await requireSiteAccess();
  // PaymentConfig is a singleton with required non-nullable fields.
  // Read existing row first so we preserve all other values on update.
  const existing = await prisma.paymentConfig.findUnique({
    where: { id: "singleton" },
  });
  if (existing) {
    await prisma.paymentConfig.update({
      where: { id: "singleton" },
      data: { roomStatus: STATUS_TO_DB[status] as "CLEAN" | "DIRTY" | "IN_USE" },
    });
  } else {
    // Brand-new database: create with required defaults for all other fields.
    await prisma.paymentConfig.create({
      data: {
        id: "singleton",
        bankName: "",
        accountName: "",
        accountNumber: "",
        updatedBy: "system",
        roomStatus: STATUS_TO_DB[status] as "CLEAN" | "DIRTY" | "IN_USE",
      },
    });
  }
}
