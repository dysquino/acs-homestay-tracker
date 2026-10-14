/**
 * Money arithmetic in integer centavos.
 *
 * The reconciliation feature is judged on one number: does the balance tie out
 * to the centavo? `0.1 + 0.2 === 0.30000000000000004` in JavaScript, so any
 * authoritative total built from `number` addition can be a centavo out and
 * then refuse to finalize (§8.6 requires an exact-zero difference). Every sum,
 * difference, and running balance in the reconciliation domain therefore goes
 * through these helpers, which work in `bigint` centavos and are exact.
 *
 * `number` is still the boundary type — Prisma returns Decimal, the UI's
 * domain types are `number`, and inputs arrive as strings. Conversion happens
 * at the edges (`toCentavos`, `toAmount`); everything in between is bigint.
 */

/** One peso, in centavos. */
const CENTAVOS_PER_PESO = 100n;

/** Decimal(10, 2) ceiling — matches MAX_MONEY in validation.ts. */
export const MAX_CENTAVOS = 9_999_999_999n;

/**
 * pesos → centavos, exactly.
 *
 * Multiplies by 100 and requires the result to be a whole number, which is the
 * only way to detect that a caller handed us a sub-centavo value. A float like
 * 1234.56 * 100 is 123456.00000000001, so we go through the decimal string
 * rather than multiplying in floating point. Also accepts a string, because form
 * inputs arrive as text and "1234.565" must fail rather than truncate.
 *
 * @throws if the value isn't a finite number of pesos with at most 2 decimals.
 */
export function toCentavos(amount: number | string): bigint {
  const text = typeof amount === "number" ? formatExact(amount) : amount.trim();

  if (text === "" || text === "-" || text === "+") {
    throw new RangeError("Amount is not a valid number.");
  }
  if (!/^-?\d*(\.\d*)?$/.test(text)) {
    throw new RangeError(`Amount "${text}" is not a valid number.`);
  }

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");

  // Trailing zeros past the second decimal are still fine ("1.500" == 1.5), but
  // a real third digit is a value the database would silently round, so reject
  // it rather than let 1.505 become 1.50 or 1.51 depending on the caller.
  const significant = fraction.replace(/0+$/, "");
  if (significant.length > 2) {
    throw new RangeError(`Amount "${text}" has more than two decimal places.`);
  }

  // Pad `significant`, not `fraction`: "1.500" must be 150 centavos, and
  // padding the raw "500" would read it as 600.
  const centavos =
    BigInt(whole || "0") * CENTAVOS_PER_PESO + BigInt(significant.padEnd(2, "0") || "0");
  return negative ? -centavos : centavos;
}

/**
 * Centavos → pesos, exact.
 *
 * The inverse of `toCentavos`, and safe to hand to `Intl.NumberFormat` or
 * persist as a Prisma Decimal.
 */
export function toAmount(centavos: bigint): number {
  const negative = centavos < 0n;
  const absolute = negative ? -centavos : centavos;
  const whole = absolute / CENTAVOS_PER_PESO;
  const fraction = absolute % CENTAVOS_PER_PESO;
  const pesos = Number(whole) + Number(fraction) / Number(CENTAVOS_PER_PESO);
  return negative ? -pesos : pesos;
}

/** Sum of any mix of pesos and centavos; exact regardless of order. */
export function sum(values: Iterable<number | string | bigint>): bigint {
  let total = 0n;
  for (const value of values) {
    total += typeof value === "bigint" ? value : toCentavos(value);
  }
  return total;
}

/** Sum straight to pesos, for callers that just want a display number. */
export function sumAmounts(values: Iterable<number | string>): number {
  return toAmount(sum(values));
}

/** `a - b`, exact. */
export function subtract(a: bigint, b: bigint): bigint {
  return a - b;
}

/** `-value`, exact. */
export function negate(centavos: bigint): bigint {
  return -centavos;
}

/** Absolute value, exact. */
export function absolute(centavos: bigint): bigint {
  return centavos < 0n ? -centavos : centavos;
}

/**
 * What a new settlement should cover, given what's already been recorded
 * against `total` — or `null` if there's nothing left worth recording.
 *
 * This is the rule that stops a second payout being written against an expense
 * that's already settled, which is why it works from the outstanding balance and
 * never from the expense's own figure. The tolerance is a centavo because a
 * leftover that small is rounding from splitting a peso, not money the owner
 * still needs to hand over — and a one-centavo settlement row would be noise
 * in every reconciliation it appears in.
 *
 * A negative balance (over-settled, e.g. an overpayment) also returns `null`:
 * there's nothing left to pay, and writing it off as a new settlement would
 * invent money.
 */
export function settleableAmount(
  total: Iterable<number | string | bigint>,
  settled: Iterable<number | string | bigint>,
): bigint | null {
  const outstanding = sum(total) - sum(settled);
  if (outstanding <= 1n) return null;
  return outstanding;
}

/**
 * Whether `value` is within `tolerance` centavos of `expected`.
 *
 * §8.6 makes the finalization requirement an exact zero difference, but the
 * "fully paid" test in §4.2 explicitly allows a configured centavo tolerance,
 * so the comparison lives here rather than being inlined at each call site.
 */
export function isWithinTolerance(value: bigint, expected: bigint, tolerance = 0n): boolean {
  return absolute(subtract(value, expected)) <= absolute(tolerance);
}

/**
 * Render `centavos` without going through a float.
 *
 * For exact-zero display (a reconciliation difference of ₱0.00, never ₱0.01)
 * where even `toAmount` followed by a comparison could read as imprecise.
 */
export function formatExactCentavos(centavos: bigint): string {
  const negative = centavos < 0n;
  const absolute = negative ? -centavos : centavos;
  const whole = absolute / CENTAVOS_PER_PESO;
  const fraction = String(absolute % CENTAVOS_PER_PESO).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * Round a `number` of pesos to 2 decimals for storage, via its shortest
 * round-trip string form. Used only at input boundaries where a float already
 * exists (a total read back from the database); `toCentavos` handles the rest.
 */
export function roundToCentavos(amount: number): number {
  return toAmount(toCentavos(roundTo2dp(amount)));
}

/** Reject a value the database column can't hold, before the write. */
export function assertWithinMax(centavos: bigint): void {
  if (absolute(centavos) > MAX_CENTAVOS) {
    throw new RangeError("Amount is too large.");
  }
}

/** Widen a float to a 2-decimal string, rounding half away from zero. */
function roundTo2dp(amount: number): string {
  if (!Number.isFinite(amount)) throw new RangeError("Amount is not a finite number.");
  const fixed = Math.abs(amount).toFixed(8);
  const [whole, fraction = ""] = fixed.split(".");
  const kept = fraction.slice(0, 2);
  const nextDigit = Number(fraction.charAt(2) || "0");
  const keptValue = Number(kept || "0") + (nextDigit >= 5 ? 1 : 0);
  const carry = keptValue === 100 ? 1 : 0;
  const padded = String(keptValue % 100).padStart(2, "0");
  const result = `${BigInt(whole || "0") + BigInt(carry)}.${padded}`;
  return amount < 0 ? `-${result}` : result;
}

/**
 * A number's exact 2-decimal string form, without the float rounding detour.
 *
 * `String(1234.56)` is "1234.56" — the shortest representation that round-trips —
 * so we only fall back to `roundTo2dp` when it isn't already clean.
 */
function formatExact(amount: number): string {
  if (!Number.isFinite(amount)) throw new RangeError("Amount is not a finite number.");
  const text = String(amount);
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return roundTo2dp(amount);
  const [, sign, whole, fraction = ""] = match;
  if (fraction.replace(/0+$/, "").length <= 2) return `${sign}${whole || "0"}.${fraction || "0"}`;
  return roundTo2dp(amount);
}