"use server";

import { prisma } from "@/lib/prisma";
import { toAmount, toCentavos } from "@/lib/finance";
import type { Expense, ExpenseInput } from "@/lib/types";
import { ValidationError, validateExpense } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import { expenseFromDb, expensePatchToDb, expenseToDb } from "./mappers";

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

export async function updateExpense(
  id: string,
  patch: Partial<ExpenseInput>,
): Promise<void> {
  await requireSiteAccess();
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (existing.cleaningId) throw new ValidationError(MANAGED);
  validateExpense({ ...expenseFromDb(existing), ...patch });
  await prisma.expense.update({ where: { id }, data: expensePatchToDb(patch) });
}

export async function deleteExpense(id: string): Promise<void> {
  await requireSiteAccess();
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (existing.cleaningId) throw new ValidationError(MANAGED);
  await prisma.expense.delete({ where: { id } });
}
