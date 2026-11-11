import { roundToCentavos } from "./finance";

/**
 * The pricing rules behind the guest-facing estimate on /book, the owner's
 * approval modal, and the rate card stored against each booking.
 *
 * One module, every caller — the breakdown a guest sees before requesting a
 * stay, the total the owner computes when approving that stay, and the rate
 * card the owner sets for a particular stay are the same arithmetic, so they
 * cannot drift apart.
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

/**
 * The rates a booking carries of its own, when the owner set them for that
 * particular stay. Either field may be null — a booking can override the
 * per-night rate but keep the standard cleaning fee, or the other way round.
 */
export type BookingRates = {
  /** The per-night rate this booking was agreed at. Null = no rate of its own. */
  nightlyRate: number | null;
  /** The cleaning fee this booking was agreed at. Null = no fee of its own. */
  cleaningFee: number | null;
};

/** The rates a booking actually ends up using. */
export type ResolvedRates = {
  /** Nights the stay covers. */
  nights: number;
  /** The per-night rate this booking uses. */
  nightlyRate: number;
  /** The cleaning fee this booking uses. */
  cleaningFee: number;
  /** Whether the stay landed in the long-stay tier. */
  isLongStay: boolean;
  /** How to label the cleaning-fee line. */
  tierLabel: string;
  /**
   * Whether the booking's own numbers were used. False means every rate came
   * from the owner's standard settings.
   */
  own: boolean;
};

/** The computed price of a stay. */
export type StayPrice = {
  /** Nights the stay covers. */
  nights: number;
  /** The per-night rate this price was computed at. */
  nightlyRate: number;
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
   * Whether any rate applies at all — all-zero means "not set up yet",
   * and the breakdown is hidden rather than showing a misleading ₱0.00 total.
   */
  configured: boolean;
};

/**
 * The rates a booking uses: its own where it has them, the owner's standard
 * where it doesn't.
 *
 * A booking's own cleaning fee replaces the tier outright — the tier only
 * decides which standard fee to start from, so a stay with its own fee is
 * labelled plainly rather than by tier.
 */
export function resolveBookingRates(
  rates: RateConfig,
  own: BookingRates | null,
  nights: number,
): ResolvedRates {
  // Defensive default — the server is the source of truth, but a caller that
  // forgets the field keeps the original 5-night behavior.
  const longStayThreshold = rates.longStayThresholdNights || DEFAULT_LONG_STAY_THRESHOLD;
  const stayNights = Number.isFinite(nights) && nights > 0 ? Math.trunc(nights) : 0;
  const isLongStay = stayNights >= longStayThreshold;

  // A tier of 0 means "not set for this tier" — fall back to whichever fee is
  // configured, so setting only one fee still prices every stay.
  const shortFee = rates.cleaningFee > 0 ? rates.cleaningFee : rates.cleaningFeeLong;
  const longFee = rates.cleaningFeeLong > 0 ? rates.cleaningFeeLong : rates.cleaningFee;
  const standardFee = isLongStay ? longFee : shortFee;

  const ownNightly = own?.nightlyRate ?? null;
  const ownCleaning = own?.cleaningFee ?? null;

  const tierLabel =
    ownCleaning !== null
      ? "Cleaning fee"
      : isLongStay && rates.cleaningFeeLong > 0 && rates.cleaningFeeLong !== rates.cleaningFee
        ? `Cleaning fee (${longStayThreshold}+ nights)`
        : "Cleaning fee";

  return {
    nights: stayNights,
    nightlyRate: ownNightly ?? rates.nightlyRate,
    cleaningFee: ownCleaning ?? standardFee,
    isLongStay,
    tierLabel,
    own: ownNightly !== null || ownCleaning !== null,
  };
}

/**
 * The price of a stay of `nights` nights at the owner's standard rates.
 *
 * The tier only differs when the two cleaning fees are non-zero AND the long
 * tier is the one being applied — otherwise the label stays plain "Cleaning
 * fee".
 */
export function calculateStayPrice(rates: RateConfig, nights: number): StayPrice {
  return calculateBookingPrice(rates, null, nights);
}

/**
 * The price of a booking, using the rates it carries of its own where it has
 * them and the owner's standard where it doesn't.
 */
export function calculateBookingPrice(
  rates: RateConfig,
  own: BookingRates | null,
  nights: number,
): StayPrice {
  const resolved = resolveBookingRates(rates, own, nights);
  const subtotal = resolved.nightlyRate * resolved.nights;

  return {
    nights: resolved.nights,
    nightlyRate: resolved.nightlyRate,
    subtotal: roundToCentavos(subtotal),
    cleaningFee: roundToCentavos(resolved.cleaningFee),
    total: roundToCentavos(subtotal + resolved.cleaningFee),
    isLongStay: resolved.isLongStay,
    tierLabel: resolved.tierLabel,
    configured: resolved.nightlyRate > 0 || resolved.cleaningFee > 0,
  };
}
