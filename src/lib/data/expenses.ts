"use server";

import { prisma } from "@/lib/prisma";
import type { Expense } from "@/lib/types";

import { expenseFromDb, expensePatchToDb, expenseToDb } from "./mappers";

export async function listExpenses(): Promise<Expense[]> {
  const rows = await prisma.expense.findMany({ orderBy: { date: "desc" } });
  return rows.map(expenseFromDb);
}

export async function createExpense(
  input: Omit<Expense, "id">,
): Promise<Expense> {
  const row = await prisma.expense.create({ data: expenseToDb(input) });
  return expenseFromDb(row);
}

export async function updateExpense(
  id: string,
  patch: Partial<Omit<Expense, "id">>,
): Promise<void> {
  await prisma.expense.update({ where: { id }, data: expensePatchToDb(patch) });
}

export async function deleteExpense(id: string): Promise<void> {
  await prisma.expense.delete({ where: { id } });
}
