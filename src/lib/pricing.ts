import { roundToCentavos } from "./finance";

/**
 * The pricing rules behind the guest-facing estimate on /book and the owner's
 * approval modal.
 *
 * One module, both callers — the breakdown a guest sees before requesting a
 * stay and the total the owner computes when approving that stay are the same
 * arithmetic, so they cannot drift apart. The owner's number is always an
 * override of this: `totalPayout` stays the single source of truth, and the
 * computed total is only what the form pre-fills.
 *
 * All money is computed in centavos via `finance.ts` and rounded back to pesos
 * at the end, so a total is never a centavo out.
 */

/** Default long-stay threshold when the owner hasn't configured one. */
export const DEFAULT_LONG_STAY_THRESHOLD = 5;

/** The rates an owner sets in Payment Settings. */
export type RateConfig = {
  /** Per-night rate (peso). 0 means "not configured". */
  nightlyRate: number;
  /** Cleaning fee for short stays (< threshold nights). 0 means "not set". */
  cleaningFee: number;
  /**
   * Cleaning fee for long stays (>= threshold nights). 0 falls back to the
   * short-stay fee when the stay would have used this tier.
   */
  cleaningFeeLong: number;
  /**
   * Nights at which a stay flips from "short" to "long" and starts using
   * `cleaningFeeLong` instead of `cleaningFee`. Owner-tunable from Payment
   * Settings; defaults to 5 to preserve the original behavior.
   */
  longStayThresholdNights: number;
};

/**
 * The rates plus the two flags the guest's booking form needs. All of it lives
 * in the same PaymentConfig row, so the public page reads it in one go.
 */
export type PricingConfig = RateConfig & {
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

/** The computed price of a stay. */
export type StayPrice = {
  /** Nights the stay covers. */
  nights: number;
  /** nightlyRate × nights. */
  subtotal: number;
  /** The cleaning fee that applies to this length of stay (0 when none is set). */
  cleaningFee: number;
  /** subtotal + cleaningFee. */
  total: number;
  /** Whether the stay landed in the long-stay tier. */
  isLongStay: boolean;
  /** How to label the cleaning-fee line for this stay. */
  tierLabel: string;
  /**
   * Whether any rate is configured at all — all-zero means "not set up yet",
   * and the breakdown is hidden rather than showing a misleading ₱0.00 total.
   */
  configured: boolean;
};

/**
 * The price of a stay of `nights` nights under the given rates.
 *
 * The tier only differs when the two cleaning fees are non-zero AND the long
 * tier is the one being applied — otherwise the label stays plain "Cleaning
 * fee".
 */
export function calculateStayPrice(rates: RateConfig, nights: number): StayPrice {
  const { nightlyRate, cleaningFee, cleaningFeeLong } = rates;
  // Defensive default — the server is the source of truth, but a caller that
  // forgets the field keeps the original 5-night behavior.
  const longStayThreshold = rates.longStayThresholdNights || DEFAULT_LONG_STAY_THRESHOLD;
  const stayNights = Number.isFinite(nights) && nights > 0 ? Math.trunc(nights) : 0;
  const isLongStay = stayNights >= longStayThreshold;

  // A tier of 0 means "not set for this tier" — fall back to whichever fee is
  // configured, so setting only one fee still prices every stay.
  const shortFee = cleaningFee > 0 ? cleaningFee : cleaningFeeLong;
  const longFee = cleaningFeeLong > 0 ? cleaningFeeLong : cleaningFee;
  const effectiveFee = isLongStay ? longFee : shortFee;

  const tierLabel =
    isLongStay && cleaningFeeLong > 0 && cleaningFeeLong !== cleaningFee
      ? `Cleaning fee (${longStayThreshold}+ nights)`
      : "Cleaning fee";

  const subtotal = nightlyRate * stayNights;

  return {
    nights: stayNights,
    subtotal: roundToCentavos(subtotal),
    cleaningFee: roundToCentavos(effectiveFee),
    total: roundToCentavos(subtotal + effectiveFee),
    isLongStay,
    tierLabel,
    configured: nightlyRate > 0 || cleaningFee > 0 || cleaningFeeLong > 0,
  };
}
