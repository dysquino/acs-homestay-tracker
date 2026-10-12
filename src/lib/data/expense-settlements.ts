"use server";

import { prisma } from "@/lib/prisma";
import { requireReconciliationEnabled } from "@/lib/reconciliation-flag";
import type { ExpenseSettlement, ExpenseSettlementInput } from "@/lib/types";
import { ValidationError, validateExpenseSettlement } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import {
  expenseSettlementFromDb,
  expenseSettlementPatchToDb,
  expenseSettlementToDb,
} from "./mappers";

/**
 * Outflows: one row per time money actually left the homestay bank, against an
 * expense or (for a guest refund) a booking. The mirror of booking-payments.ts.
 *
 * §4.5 is the distinction that matters here: an expense records what a cost was
 * for, a settlement records when the money left. An owner who bought supplies
 * out of pocket creates an expense and nothing else — no settlement, no bank
 * outflow — until they're reimbursed, and that reimbursement is what shows up
 * here as an OWNER_REIMBURSEMENT on the reimbursement date, not the expense
 * date.
 */

/** Settlements against one expense, newest first. */
export async function listExpenseSettlements(expenseId: string): Promise<ExpenseSettlement[]> {
  await requireSiteAccess();
  requireReconciliationEnabled();
  const rows = await prisma.expenseSettlement.findMany({
    where: { expenseId },
    orderBy: { paidDate: "desc" },
  });
  return rows.map(expenseSettlementFromDb);
}

/** Every settlement across all expenses and bookings — the future outflow pool. */
export async function listAllExpenseSettlements(): Promise<ExpenseSettlement[]> {
  await requireSiteAccess();
  requireReconciliationEnabled();
  const rows = await prisma.expenseSettlement.findMany({
    orderBy: { paidDate: "desc" },
  });
  return rows.map(expenseSettlementFromDb);
}

export async function createExpenseSettlement(
  input: ExpenseSettlementInput,
): Promise<ExpenseSettlement> {
  await requireSiteAccess();
  requireReconciliationEnabled();
  validateExpenseSettlement(input);
  await assertSourceExists(input);
  const row = await prisma.expenseSettlement.create({ data: expenseSettlementToDb(input) });
  return expenseSettlementFromDb(row);
}

export async function updateExpenseSettlement(
  id: string,
  patch: Partial<ExpenseSettlementInput>,
): Promise<void> {
  await requireSiteAccess();
  requireReconciliationEnabled();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.expenseSettlement.findUniqueOrThrow({ where: { id } });
    if (existing.status === "VOIDED") {
      throw new ValidationError("This settlement is voided. Create a new one instead of editing it.");
    }
    // settlementType is fixed after creation: switching a row between "settles
    // an expense" and "refunds a guest" would change which source record it
    // points at, and expenseSettlementPatchToDb deliberately won't move those.
    if (patch.settlementType && patch.settlementType !== expenseSettlementFromDb(existing).settlementType) {
      throw new ValidationError(
        "A settlement's type can't change. Void this one and create the right kind.",
      );
    }
    const merged = { ...expenseSettlementFromDb(existing), ...patch };
    validateExpenseSettlement(merged);
    await tx.expenseSettlement.update({
      where: { id },
      data: expenseSettlementPatchToDb(patch),
    });
  });
}

/** Void, never delete (§7.13). */
export async function voidExpenseSettlement(id: string, voidedBy: string): Promise<void> {
  await requireSiteAccess();
  requireReconciliationEnabled();
  if (!voidedBy.trim()) throw new ValidationError("Voided by is required.");
  const existing = await prisma.expenseSettlement.findUniqueOrThrow({ where: { id } });
  if (existing.status === "VOIDED") return; // idempotent
  await prisma.expenseSettlement.update({
    where: { id },
    data: { status: "VOIDED", voidedAt: new Date(), voidedBy },
  });
}

/**
 * Confirm the source row actually exists before writing a settlement against
 * it. The foreign key would catch a wrong id, but "Expense not found" from
 * Postgres is a worse message than naming the field, and the guest-refund
 * branch sets `expenseId` to null — so a missing booking would otherwise fail
 * with a bare constraint error.
 */
async function assertSourceExists(input: ExpenseSettlementInput): Promise<void> {
  if (input.settlementType === "guest_refund") {
    await prisma.booking.findUniqueOrThrow({ where: { id: input.refundForBookingId ?? "" } });
    return;
  }
  await prisma.expense.findUniqueOrThrow({ where: { id: input.expenseId ?? "" } });
}