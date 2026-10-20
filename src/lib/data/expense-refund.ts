import "server-only";

import type { Prisma } from "@prisma/client";

import { expenseRefundStatusAfterPayoutChange } from "@/lib/expense-refund";
import type { ExpenseRefundStatus, SettlementType } from "@/lib/types";

import { EXPENSE_REFUND_STATUS_TO_DB } from "./mappers";

/**
 * Bring an expense's refund status in line with what has been paid out of it.
 *
 * Runs inside the caller's transaction, and for the same reason the payout
 * rides along with the expense save in `updateExpense`: a settlement that
 * exists while the row still claims money is owed would leave the dashboard
 * asking for a reimbursement that was already paid, and would keep the money
 * out of the month's outflow picture.
 *
 * The status is only ever corrected when the payouts prove it, never guessed:
 * a fully paid-out expense is refunded, and a reimbursement that was taken
 * back puts the claim back. Everything else is left exactly as the owner set
 * it — the rule lives in `src/lib/expense-refund.ts` and is tested there.
 */
export async function syncExpenseRefundStatus(
  tx: Prisma.TransactionClient,
  expenseId: string,
  change: {
    /** Active settlement amounts before this change. */
    before: (number | string)[];
    /** The kind of payout this change touched, when it touched one. */
    settlementType?: SettlementType;
    /** What the expense cost before this change, when the change moved it. */
    previousAmount?: number | string;
  },
): Promise<void> {
  const expense = await tx.expense.findUnique({
    where: { id: expenseId },
    include: { settlements: { where: { status: "ACTIVE" }, select: { amount: true } } },
  });
  if (!expense) return;

  const stored: ExpenseRefundStatus = expense.refundStatus === "OWED" ? "owed" : "refunded";
  const next = expenseRefundStatusAfterPayoutChange({
    amount: expense.amount.toString(),
    previousAmount: change.previousAmount,
    paidBy: expense.paidBy,
    stored,
    before: change.before,
    after: expense.settlements.map((s) => s.amount.toString()),
    settlementType: change.settlementType,
  });
  if (next === stored) return;

  await tx.expense.update({
    where: { id: expenseId },
    data: { refundStatus: EXPENSE_REFUND_STATUS_TO_DB[next] },
  });
}
