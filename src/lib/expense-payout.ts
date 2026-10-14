import { settleableAmount, sum, toAmount } from "./finance";
import type { ExpenseSettlement } from "./types";

type SettlementAmount = Pick<ExpenseSettlement, "amount" | "status">;

/** Remaining amount that can still be paid, with centavo-safe arithmetic. */
export function expenseOutstandingAmount(
  expenseAmount: number | string,
  settledAmount: number | string,
): number {
  const outstanding = settleableAmount([expenseAmount], [settledAmount]);
  return outstanding === null ? 0 : toAmount(outstanding);
}

/**
 * Exact payout totals for an expense.
 *
 * Expense installments are separate settlement rows, so only active rows count
 * toward the amount paid. Keeping this calculation in centavos prevents the UI
 * from offering a one-centavo-over payout after several fractional installments.
 */
export function expensePayoutSummary(
  expenseAmount: number | string,
  settlements: SettlementAmount[],
) {
  const activeAmounts = settlements
    .filter((settlement) => settlement.status === "active")
    .map((settlement) => settlement.amount);
  const settled = sum(activeAmounts);
  const outstanding = expenseOutstandingAmount(expenseAmount, toAmount(settled));

  return {
    settled: toAmount(settled),
    outstanding,
    fullySettled: outstanding === 0,
  };
}
