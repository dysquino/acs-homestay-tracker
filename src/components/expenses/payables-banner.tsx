"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { Payables } from "@/lib/selectors";

/**
 * What's still owed to whoever fronted an expense.
 *
 * A payable is a standing debt rather than a month's figure: an expense from
 * September that is still unpaid is still owed today, so this is deliberately
 * not tied to the period the list below is showing. Hiding it behind the
 * period picker would let a real debt disappear the moment the owner looked
 * at a different month.
 *
 * The figure is the balance left, not the expenses' own amount — an expense
 * paid back in instalments still owes only what is left of it.
 *
 * It sits above the list rather than in the sidebar because the sidebar is
 * below the fold on a phone, and this is the number the owner came for.
 */
export function PayablesBanner({
  payables,
  onShow,
}: {
  payables: Payables;
  onShow: () => void;
}) {
  // Nothing owed: no banner. Its absence is the answer, and an empty strip
  // on every page load would only be noise.
  if (payables.count === 0) return null;

  const who = payables.byPayer.map((p) => p.who).join(", ");

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      {/* One line on a desktop, wrapping down to three on a phone. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-amber-900">Still payable</span>
        <span className="text-xl font-semibold tabular-nums text-amber-900">
          {formatCurrency(payables.total)}
        </span>
        <span className="text-xs text-amber-800">
          {payables.count} expense{payables.count === 1 ? "" : "s"} not yet refunded · to {who}
        </span>
      </div>
      {/* Full width on a phone, where the text above fills the row and the
          button would otherwise sit alone in a corner of it. */}
      <Button size="sm" className="w-full sm:w-auto" onClick={onShow}>
        Show them
      </Button>
    </div>
  );
}
