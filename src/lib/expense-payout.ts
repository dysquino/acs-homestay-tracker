import { settleableAmount, sum, toAmount, toCentavos } from "./finance";
import { isBankPayer, type ExpenseSettlement } from "./types";

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

/**
 * What the "Paid out" panel should say about an expense.
 *
 * An expense paid by the bank account was paid by the homestay account itself,
 * so the money left in full. What a settlement adds on top is the DATE it left
 * — which is what reconciliation needs to file the outflow in the right month.
 * Reading the "left the bank" figure off the settlements instead would say
 * "₱0 left the bank" about an expense the bank paid, which is the opposite of
 * the truth, and would leave the owner looking for money that had already
 * gone out.
 *
 * For an expense someone else fronted, the settlements are the only record of
 * what left — the owner may have been reimbursed in instalments, or not yet at
 * all — so the figure stays as it was.
 */
export function expensePayoutView(
  expenseAmount: number | string,
  settlements: SettlementAmount[],
  paidBy: string,
) {
  const summary = expensePayoutSummary(expenseAmount, settlements);
  const paidByBank = isBankPayer(paidBy);

  return {
    /** How much of the expense's money left the bank. */
    leftTheBank: paidByBank ? toAmount(toCentavos(expenseAmount)) : summary.settled,
    /**
     * What still has no payout recorded against it. Read off the settlements
     * even for a bank-paid expense, so the payout form still offers the amount
     * that needs dating — zeroing it here would make that form unusable.
     */
    outstanding: summary.outstanding,
    /** Whether the homestay account paid this itself. */
    paidByBank,
    /** Whether any payout has been recorded against it. */
    recorded: settlements.some((settlement) => settlement.status === "active"),
    /**
     * Whether every peso of it has been recorded as a payout. Off the
     * settlements rather than `outstanding`, so a bank-paid expense with no
     * payout yet still offers to record the date it left.
     */
    fullySettled: summary.fullySettled,
  };
}
