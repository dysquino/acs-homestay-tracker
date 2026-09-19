import "server-only";

import type { CleaningSchedule, Prisma } from "@prisma/client";

/** The expense a paid cleaning produces. Shared by the sync and the CSV import. */
export function cleaningExpenseFields(cleaning: CleaningSchedule, guestName?: string) {
  const cleaner = cleaning.cleanerName.trim() || "Unassigned";
  return {
    date: cleaning.date,
    category: "CLEANING_PAYMENT" as const,
    description: `Cleaning payment — ${cleaner}${guestName ? ` (after ${guestName})` : ""}`,
    amount: cleaning.paymentAmount,
  };
}

/**
 * Keeps a paid cleaning and its expense in step: a cleaning that is Paid (with
 * an amount) has exactly one linked expense; one that is Unpaid has none.
 * Called from inside the same transaction as every cleaning write, so the two
 * tables can never disagree.
 *
 * The expense is dated on the cleaning date (not the day someone clicked
 * "Mark paid"), so the cost lands in the same month as the turnover's income
 * and toggling paid/unpaid never shifts it between months.
 */
export async function syncCleaningExpense(
  tx: Prisma.TransactionClient,
  cleaning: CleaningSchedule,
  actor: string,
): Promise<void> {
  const existing = await tx.expense.findUnique({
    where: { cleaningId: cleaning.id },
  });
  const shouldExist =
    cleaning.paymentStatus === "PAID" && Number(cleaning.paymentAmount) > 0;

  if (!shouldExist) {
    if (existing) await tx.expense.delete({ where: { id: existing.id } });
    return;
  }

  const guest = cleaning.bookingId
    ? (
        await tx.booking.findUnique({
          where: { id: cleaning.bookingId },
          select: { guestName: true },
        })
      )?.guestName
    : undefined;
  const fields = cleaningExpenseFields(cleaning, guest);

  if (existing) {
    // Keep paidBy: it records who paid, not who last edited the cleaning.
    await tx.expense.update({ where: { id: existing.id }, data: fields });
  } else {
    await tx.expense.create({
      data: {
        ...fields,
        paidBy: actor,
        receiptUrl: "",
        createdBy: actor,
        cleaningId: cleaning.id,
      },
    });
  }
}
