/**
 * The payout-date divergence rule, in one place.
 *
 * A payout is recorded against a record, but reconciliation counts it in the
 * month it was *paid*. Those are usually the same month and the check is
 * silent. When they differ — an expense or cleaning from last month paid today —
 * the money files itself in the wrong period and nothing downstream can catch
 * it: a wrong date reconciles perfectly against itself, because the statement
 * line and the recorded outflow agree with each other and only the month is
 * off.
 *
 * So the divergence is surfaced to the owner at the moment they can still fix
 * it, which is before the save rather than at month-end.
 */

/**
 * Whether `payoutDate` falls in a different month from the record's own date.
 *
 * An empty payout date is not divergence — it means "not recorded", and the
 * caller decides separately whether to prompt for one. Dates are compared as
 * `YYYY-MM` prefixes, so an unparseable or partial value simply won't match and
 * reads as divergent, which is the safe direction: it warns rather than hides.
 */
export function payoutDateDiverges(payoutDate: string, recordDate: string): boolean {
  if (payoutDate === "") return false;
  return payoutDate.slice(0, 7) !== recordDate.slice(0, 7);
}

/**
 * Which month a payout date will be counted in, phrased for the warning copy.
 *
 * "This month" rather than repeating the date, because the owner is looking at
 * a form, not a calendar, and the distinction that matters is which side of the
 * month boundary they just crossed.
 */
export function payoutMonthLabel(payoutDate: string, todayDate: string): "this" | "that" {
  return payoutDate.slice(0, 7) === todayDate.slice(0, 7) ? "this" : "that";
}