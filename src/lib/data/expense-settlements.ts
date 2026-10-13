"use server";

import { prisma } from "@/lib/prisma";
import { toAmount, toCentavos } from "@/lib/finance";
import { requireReconciliationEnabled } from "./reconciliation-status";
import type { ExpenseSettlement, ExpenseSettlementInput } from "@/lib/types";
import { ValidationError, validateExpenseSettlement } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import { dateToISO } from "./mappers";
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
  await requireReconciliationEnabled();
  const rows = await prisma.expenseSettlement.findMany({
    where: { expenseId },
    orderBy: { paidDate: "desc" },
  });
  return rows.map(expenseSettlementFromDb);
}

/** Every settlement across all expenses and bookings — the future outflow pool. */
export async function listAllExpenseSettlements(): Promise<ExpenseSettlement[]> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  const rows = await prisma.expenseSettlement.findMany({
    orderBy: { paidDate: "desc" },
  });
  return rows.map(expenseSettlementFromDb);
}

export async function createExpenseSettlement(
  input: ExpenseSettlementInput,
): Promise<ExpenseSettlement> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
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
  await requireReconciliationEnabled();
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
  await requireReconciliationEnabled();
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
export type ExpenseAwaitingPayout = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  paidBy: string;
  refundStatus: "refunded" | "owed";
  /** How much has already been recorded as leaving the bank. */
  settled: number;
  /** What still has no payout recorded against it. */
  outstanding: number;
  /** Cleaning expenses were created by marking a schedule paid, so the amount
   *  is known to have been spent — only the date is missing. */
  fromCleaning: boolean;
};

/**
 * Expenses that still have no payout date recorded.
 *
 * §4.5's distinction is that an expense records what a cost was *for* while a
 * settlement records when the money actually left the bank. Without the second
 * half, that money can never be reconciled: it never appears in an outflow, so
 * the month's balance is out by however much was spent and nothing on screen
 * says why.
 *
 * Both halves of `refundStatus` appear here, deliberately. REFUNDED does not
 * mean "already left the bank" — it means nobody is owed a reimbursement, which
 * is the correct state for an expense paid straight from the homestay account
 * even though the money very much did move. Gating this list on OWED would
 * therefore hide exactly the expenses most likely to have left the bank.
 *
 * Newest first: the worklist is most useful as "what still needs doing".
 */
export async function listExpensesAwaitingPayout(limit = 100): Promise<ExpenseAwaitingPayout[]> {
  await requireSiteAccess();
  await requireReconciliationEnabled();

  const expenses = await prisma.expense.findMany({
    orderBy: { date: "desc" },
    take: limit,
    select: {
      id: true,
      date: true,
      description: true,
      category: true,
      amount: true,
      paidBy: true,
      refundStatus: true,
      cleaningId: true,
      settlements: {
        where: { status: "ACTIVE" },
        select: { amount: true },
      },
    },
  });

  const out: ExpenseAwaitingPayout[] = [];
  for (const e of expenses) {
    let settled = 0n;
    for (const s of e.settlements) settled += toCentavos(s.amount.toString());
    const total = toCentavos(e.amount.toString());
    const outstanding = total - settled;
    // A centavo is a rounding artefact, not money still to pay out.
    if (outstanding <= 1n) continue;

    out.push({
      id: e.id,
      date: dateToISO(e.date),
      description: e.description,
      category: e.category,
      amount: toAmount(total),
      paidBy: e.paidBy,
      refundStatus: e.refundStatus === "OWED" ? "owed" : "refunded",
      settled: toAmount(settled),
      outstanding: toAmount(outstanding),
      fromCleaning: e.cleaningId !== null,
    });
  }
  return out;
}
