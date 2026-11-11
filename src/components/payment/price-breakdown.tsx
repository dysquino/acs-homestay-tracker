"use client";

import { calculateStayPrice, type RateConfig } from "@/lib/pricing";
import { formatCurrency, formatWhole } from "@/lib/format";

/**
 * The price estimate shown between the calendar and the form on /book.
 * Two states:
 * - Dates not picked yet: shows the static rates ("From ₱1,500 per night +
 *   ₱500 cleaning fee; ₱300 for 5+ nights") so the guest sees the pricing
 *   shape.
 * - Both dates picked: full breakdown — per-night rate × nights subtotal,
 *   cleaning fee, total — with the explicit total at the bottom.
 *
 * Hidden entirely when no rates are configured.
 *
 * The arithmetic lives in `@/lib/pricing`, shared with the owner's approval
 * modal, so the estimate a guest sees and the total the owner computes are
 * the same calculation. The totals here are informational; the owner still
 * sets totalPayout on the actual Booking after approving the request, and may
 * differ if the stay is custom-priced.
 */
export function PriceBreakdown({
  pricing,
  nights,
}: {
  pricing: RateConfig;
  nights: number;
}) {
  const { nightlyRate, cleaningFee, cleaningFeeLong } = pricing;
  const price = calculateStayPrice(pricing, nights);
  const longStayThreshold = pricing.longStayThresholdNights || 5;
  if (!price.configured) return null;

  // Dates not picked yet — show the static per-night + cleaning rates.
  if (nights === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Price</h2>
        <p className="mt-1 text-sm text-slate-600">
          From <strong className="text-slate-900">{formatCurrency(nightlyRate)}</strong> per night
          {cleaningFee > 0 ? (
            <>
              {" "}
              + <strong className="text-slate-900">{formatCurrency(cleaningFee)}</strong> cleaning fee
              {cleaningFeeLong > 0 && cleaningFeeLong !== cleaningFee ? (
                <>
                  {" "}
                  (<strong className="text-slate-900">{formatCurrency(cleaningFeeLong)}</strong> for stays of {longStayThreshold}+ nights)
                </>
              ) : null}
            </>
          ) : cleaningFeeLong > 0 ? (
            <>
              {" "}
              + <strong className="text-slate-900">{formatCurrency(cleaningFeeLong)}</strong> cleaning fee ({longStayThreshold}+ nights)
            </>
          ) : null}
          . Pick your dates to see the total.
        </p>
      </section>
    );
  }

  // Dates picked — full breakdown.
  const { subtotal, cleaningFee: effectiveFee, total, tierLabel } = price;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Price breakdown</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-600">
            {formatCurrency(nightlyRate)} × {price.nights} night{price.nights === 1 ? "" : "s"}
          </dt>
          <dd className="font-medium text-slate-900 tabular-nums">{formatWhole(subtotal)}</dd>
        </div>
        {effectiveFee > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-600">{tierLabel}</dt>
            <dd className="font-medium text-slate-900 tabular-nums">{formatWhole(effectiveFee)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-medium text-slate-700">Total</span>
        <span className="text-base font-semibold text-slate-900 tabular-nums">{formatCurrency(total)}</span>
      </div>
    </section>
  );
}
