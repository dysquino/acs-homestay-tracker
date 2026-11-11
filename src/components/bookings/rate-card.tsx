"use client";

import { formatCurrency } from "@/lib/format";

/**
 * The rate card's breakdown rows — per-night × nights, cleaning fee, and the
 * total those rates come to.
 *
 * Shared by the approval modal and the edit-booking modal so the two can't
 * show the same numbers differently. The total it renders is the *card's*
 * total; what the guest actually pays is the booking's payout, which the
 * caller shows alongside when the two differ.
 */
export function RateCardBreakdown({
  nightlyRate,
  nights,
  subtotal,
  cleaningFee,
  tierLabel,
  total,
}: {
  /** The per-night rate this card was built at. */
  nightlyRate: number;
  /** Nights the stay covers. */
  nights: number;
  /**
   * nightlyRate × nights, already rounded to the centavo by the pricing
   * module. Passed in rather than multiplied again here, so the line shown
   * is exactly the line that was priced.
   */
  subtotal: number;
  /** The cleaning fee for this stay. */
  cleaningFee: number;
  /** How to label the cleaning-fee line ("Cleaning fee", "Cleaning fee (5+ nights)"). */
  tierLabel: string;
  /** The card's total — nightlyRate × nights + cleaningFee. */
  total: number;
}) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-slate-600">
          {formatCurrency(nightlyRate)} × {nights} night{nights === 1 ? "" : "s"}
        </dt>
        <dd className="font-medium text-slate-900 tabular-nums">{formatCurrency(subtotal)}</dd>
      </div>
      {cleaningFee > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-600">{tierLabel}</dt>
          <dd className="font-medium text-slate-900 tabular-nums">{formatCurrency(cleaningFee)}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1.5">
        <dt className="font-medium text-slate-700">Total from these rates</dt>
        <dd className="font-semibold text-slate-900 tabular-nums">{formatCurrency(total)}</dd>
      </div>
    </dl>
  );
}
