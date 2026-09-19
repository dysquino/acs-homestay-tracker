"use server";

import { prisma } from "@/lib/prisma";
import type { Expense, ExpenseInput } from "@/lib/types";
import { ValidationError, validateExpense } from "@/lib/validation";

import { expenseFromDb, expensePatchToDb, expenseToDb } from "./mappers";

const MANAGED = "This expense is managed from the Cleaning page.";

export async function listExpenses(): Promise<Expense[]> {
  const rows = await prisma.expense.findMany({ orderBy: { date: "desc" } });
  return rows.map(expenseFromDb);
}

export async function createExpense(
  input: ExpenseInput,
): Promise<Expense> {
  validateExpense(input);
  // expenseToDb never writes cleaningId, so a client can't forge the link.
  const row = await prisma.expense.create({ data: expenseToDb(input) });
  return expenseFromDb(row);
}

export async function updateExpense(
  id: string,
  patch: Partial<ExpenseInput>,
): Promise<void> {
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (existing.cleaningId) throw new ValidationError(MANAGED);
  validateExpense({ ...expenseFromDb(existing), ...patch });
  await prisma.expense.update({ where: { id }, data: expensePatchToDb(patch) });
}

export async function deleteExpense(id: string): Promise<void> {
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (existing.cleaningId) throw new ValidationError(MANAGED);
  await prisma.expense.delete({ where: { id } });
}
