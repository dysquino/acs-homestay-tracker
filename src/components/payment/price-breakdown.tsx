"use client";

import { formatCurrency, formatWhole } from "@/lib/format";

/** Threshold (nights) at which the long-stay cleaning rate is used. */
export const LONG_STAY_THRESHOLD = 5;

export type PricingConfig = {
  /** Per-night rate (peso). 0 means "not configured". */
  nightlyRate: number;
  /** Cleaning fee for short stays (< 5 nights). 0 means "not set". */
  cleaningFee: number;
  /**
   * Cleaning fee for long stays (>= 5 nights). 0 falls back to the
   * short-stay fee when the stay would have used this tier.
   */
  cleaningFeeLong: number;
  /**
   * Whether the ID photo is required on the form. When false, the field
   * is shown as optional and the form doesn't block submission for it.
   */
  idPhotoRequired: boolean;
  /**
   * Whether the payment screenshot is required on the form. When true,
   * the form blocks submission until a screenshot is attached.
   */
  paymentScreenshotRequired: boolean;
};

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
 * The totals here are informational; the owner still sets totalPayout on the
 * actual Booking after approving the request, and may differ if the stay is
 * custom-priced.
 */
export function PriceBreakdown({
  pricing,
  nights,
}: {
  pricing: PricingConfig;
  nights: number;
}) {
  const { nightlyRate, cleaningFee, cleaningFeeLong } = pricing;
  const configured = nightlyRate > 0 || cleaningFee > 0 || cleaningFeeLong > 0;
  if (!configured) return null;

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
                  (<strong className="text-slate-900">{formatCurrency(cleaningFeeLong)}</strong> for stays of 5+ nights)
                </>
              ) : null}
            </>
          ) : cleaningFeeLong > 0 ? (
            <>
              {" "}
              + <strong className="text-slate-900">{formatCurrency(cleaningFeeLong)}</strong> cleaning fee (5+ nights)
            </>
          ) : null}
          . Pick your dates to see the total.
        </p>
      </section>
    );
  }

  // Dates picked — full breakdown. The tier label only differs when the two
  // fees are non-zero AND the long tier is being applied.
  const isLongStay = nights >= LONG_STAY_THRESHOLD;
  const shortFee = cleaningFee > 0 ? cleaningFee : cleaningFeeLong;
  const longFee = cleaningFeeLong > 0 ? cleaningFeeLong : cleaningFee;
  const effectiveFee = isLongStay ? longFee : shortFee;
  const tierLabel =
    isLongStay && cleaningFeeLong > 0 && cleaningFeeLong !== cleaningFee
      ? `Cleaning fee (${LONG_STAY_THRESHOLD}+ nights)`
      : "Cleaning fee";

  const subtotal = nightlyRate * nights;
  const total = subtotal + effectiveFee;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Price breakdown</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-600">
            {formatCurrency(nightlyRate)} × {nights} night{nights === 1 ? "" : "s"}
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