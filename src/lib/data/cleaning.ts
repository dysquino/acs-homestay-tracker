"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { settleableAmount, toAmount } from "@/lib/finance";
import type { CleaningRecord } from "@/lib/types";
import { validateCleaning } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import { syncCleaningExpense } from "./cleaning-expense";
import {
  cleaningFromDb,
  cleaningPatchToDb,
  cleaningToDb,
  expenseSettlementToDb,
} from "./mappers";

export async function listCleaning(): Promise<CleaningRecord[]> {
  await requireSiteAccess();
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
  payoutDate?: string,
): Promise<CleaningRecord> {
  await requireSiteAccess();
  validateCleaning(input);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.cleaningSchedule.create({
      data: cleaningToDb(input),
    });
    await syncCleaningExpense(tx, created, input.createdBy);
    if (payoutDate) {
      await recordCleanerPayout(tx, created.id, payoutDate, input.createdBy, created.cleanerName);
    }
    return created;
  });
  return cleaningFromDb(row);
}

/**
 * Records that the cleaner's money left the account on `payoutDate`.
 *
 * Called inside the caller's transaction rather than as a follow-up write
 * because the expense it settles is created a moment earlier — a separate call
 * would mean a save that shows "paid" with no payout recorded if the second
 * write failed, which is precisely the state reconciliation can't see.
 *
 * Settles the amount still outstanding rather than the cleaning's own figure,
 * so a partly settled expense can't be paid twice, and skips a centavo or less
 * because that's rounding, not money still to pay out.
 */
async function recordCleanerPayout(
  tx: Prisma.TransactionClient,
  cleaningId: string,
  payoutDate: string,
  actor: string,
  cleanerName: string | null,
): Promise<void> {
  // syncCleaningExpense only creates the expense when the cleaning is paid
  // for a non-zero amount, so an unpaid edit with a date records nothing.
  const expense = await tx.expense.findUnique({
    where: { cleaningId },
    include: { settlements: { where: { status: "ACTIVE" }, select: { amount: true } } },
  });
  if (!expense) return;

  const outstanding = settleableAmount(
    [expense.amount.toString()],
    expense.settlements.map((s) => s.amount.toString()),
  );
  if (outstanding === null) return;

  await tx.expenseSettlement.create({
    data: expenseSettlementToDb({
      expenseId: expense.id,
      amount: toAmount(outstanding),
      paidDate: payoutDate,
      settlementType: "cleaner_payment",
      reimbursedTo: cleanerName ?? "",
      reference: "",
      notes: "",
      createdBy: actor,
    }),
  });
}

/**
 * `actor` is who is making this change — recorded as the payer if this edit
 * is what marks the cleaning paid.
 */
export async function updateCleaning(
  id: string,
  patch: Partial<Omit<CleaningRecord, "id">>,
  actor: string,
  /**
   * When the cleaner's money left the account, if it's being recorded now.
   * See `recordCleanerPayout` for why this isn't a separate write.
   */
  payoutDate?: string,
): Promise<void> {
  await requireSiteAccess();
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
    if (payoutDate) await recordCleanerPayout(tx, id, payoutDate, actor, row.cleanerName);
  });
}

/** Its linked expense (if any) goes with it — cascade in the schema. */
export async function deleteCleaning(id: string): Promise<void> {
  await requireSiteAccess();
  await prisma.cleaningSchedule.delete({ where: { id } });
}
