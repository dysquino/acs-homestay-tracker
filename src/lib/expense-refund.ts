import { settleableAmount } from "./finance";
import { isBankPayer, type ExpenseRefundStatus, type SettlementType } from "./types";

/**
 * Whether an expense is still owed to whoever fronted it, and how that follows
 * from what has been paid out of it.
 *
 * `refundStatus` and the settlements answer two different questions, and the
 * app keeps them apart on purpose (§4.5):
 *
 * - `refundStatus` — "is whoever fronted this still owed a reimbursement?"
 * - the settlements — "how much of the money has actually left the bank?"
 *
 * The second one settles the first. Once an expense is paid out in full there
 * is provably nobody left to reimburse, so the claim is answered without
 * anyone having to remember to flip a dropdown. That is the whole point of
 * this module: the status follows the money, instead of the two disagreeing
 * in a way only the owner can spot.
 *
 * The disagreement is not cosmetic. An expense left marked "not yet refunded"
 * after it has been paid back stays in the dashboard's refund action items and
 * out of the money-in-bank figure, so the month reads short by exactly the
 * amount that was already reimbursed.
 */
export type ExpensePayoutChange = {
  /** What the expense costs now. */
  amount: number | string;
  /** What it cost before this change, when the change moved the amount. */
  previousAmount?: number | string;
  /** Who fronted the cost. */
  paidBy: string;
  /** The status on the row right now. */
  stored: ExpenseRefundStatus;
  /** Active settlement amounts before this change. */
  before: (number | string)[];
  /** Active settlement amounts after this change. */
  after: (number | string)[];
  /**
   * The kind of payout this change touched, when it touched one. Only a
   * reimbursement to whoever fronted the cost can leave them owed again —
   * taking back a vendor payment leaves an expense without a payout date, not
   * a person out of pocket.
   */
  settlementType?: SettlementType;
};

/**
 * The refund status an expense should carry once a payout has been recorded,
 * edited, or taken back.
 *
 * Three cases, in order:
 *
 * 1. **Fully paid out → "refunded".** There is nobody left to reimburse,
 *    whatever the row said before. This is the rule the feature exists for.
 *
 * 2. **No longer fully paid out, and the payout that had settled it was a
 *    reimbursement → "owed".** Voiding the reimbursement that paid someone
 *    back means they have not been paid back, so the claim comes back with
 *    it. Without this the row would keep saying "refunded" while the money
 *    sat unpaid — the same lie in the opposite direction.
 *
 * 3. **Anything else → the row's own claim stands.** A part-paid expense
 *    marked "not yet refunded" is a real debt and stays one. A part-paid
 *    expense marked "refunded" is an expense whose payout date is missing,
 *    which the payout worklist chases in its own words.
 */
export function expenseRefundStatusAfterPayoutChange(
  change: ExpensePayoutChange,
): ExpenseRefundStatus {
  const { amount, previousAmount, paidBy, stored, before, after, settlementType } = change;

  const wasSettled = settleableAmount([previousAmount ?? amount], before) === null;
  const isSettled = settleableAmount([amount], after) === null;

  // Fully paid out: nobody is owed. Whether the row agreed before is beside
  // the point — the money has gone.
  if (isSettled) return "refunded";

  // It stopped being fully paid out, and what was taken back was money that
  // had gone to whoever fronted the cost. They are owed again.
  if (
    wasSettled &&
    settlementType === "owner_reimbursement" &&
    !isBankPayer(paidBy)
  ) {
    return "owed";
  }

  // The bank account paid it, so there is nobody to pay back — and a bank-paid
  // expense is rejected with "owed", so writing it would make the row
  // un-editable.
  return stored;
}
