"use server";

import { prisma } from "@/lib/prisma";
import { settleableAmount, toAmount, toCentavos } from "@/lib/finance";
import type { Expense, ExpenseInput, SettlementType } from "@/lib/types";
import { ValidationError, validateExpense } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import {
  expenseFromDb,
  expensePatchToDb,
  expenseSettlementToDb,
  expenseToDb,
} from "./mappers";

const MANAGED = "This expense is managed from the Cleaning page.";

export async function listExpenses(): Promise<Expense[]> {
  await requireSiteAccess();
  // Active settlements only: a voided one releases its amount back, and this is
  // what decides whether the expense still needs a payout date.
  const rows = await prisma.expense.findMany({
    orderBy: { date: "desc" },
    include: { settlements: { where: { status: "ACTIVE" }, select: { amount: true } } },
  });
  return rows.map((row) => {
    let settled = 0n;
    for (const s of row.settlements) settled += toCentavos(s.amount.toString());
    return { ...expenseFromDb(row), settledAmount: toAmount(settled) };
  });
}

export async function createExpense(
  input: ExpenseInput,
): Promise<Expense> {
  await requireSiteAccess();
  validateExpense(input);
  // expenseToDb never writes cleaningId, so a client can't forge the link.
  const row = await prisma.expense.create({ data: expenseToDb(input) });
  return expenseFromDb(row);
}

/**
 * A payout recorded alongside an expense save: when the money left, and what
 * kind of movement it was. The type is what tells the audit whose pocket it
 * came out of — a vendor the business paid directly is not the same thing as
 * paying back whoever fronted the cost.
 */
export type ExpensePayout = {
  paidDate: string;
  settlementType: SettlementType;
  /** Who received an owner reimbursement — the person who paid out of pocket. */
  reimbursedTo?: string;
  reference?: string;
  notes?: string;
};

/**
 * `payout` is applied in the same transaction as the expense update rather than
 * as a follow-up write. Saved separately, a failure between the two leaves an
 * expense recorded as paid out with no settlement — which reads as settled in
 * the list and is invisible to the month's outflow pool, so the month closes
 * short with nothing to show for it.
 */
export async function updateExpense(
  id: string,
  patch: Partial<ExpenseInput>,
  payout?: ExpensePayout,
  actor = "Unknown",
): Promise<void> {
  await requireSiteAccess();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (existing.cleaningId) throw new ValidationError(MANAGED);
    validateExpense({ ...expenseFromDb(existing), ...patch });

    await tx.expense.update({ where: { id }, data: expensePatchToDb(patch) });
    if (!payout) return;

    const expense = await tx.expense.findUniqueOrThrow({
      where: { id },
      include: { settlements: { where: { status: "ACTIVE" }, select: { amount: true } } },
    });
    // Only what's still outstanding, so a partly settled expense can't be paid
    // twice and a rounding remainder doesn't become its own row.
    const outstanding = settleableAmount(
      [expense.amount.toString()],
      expense.settlements.map((s) => s.amount.toString()),
    );
    if (outstanding === null) return;

    await tx.expenseSettlement.create({
      data: expenseSettlementToDb({
        expenseId: id,
        amount: toAmount(outstanding),
        paidDate: payout.paidDate,
        settlementType: payout.settlementType,
        reimbursedTo: payout.reimbursedTo ?? "",
        reference: payout.reference ?? "",
        notes: payout.notes ?? "",
        createdBy: actor,
      }),
    });
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await requireSiteAccess();
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (existing.cleaningId) throw new ValidationError(MANAGED);
  await prisma.expense.delete({ where: { id } });
}
