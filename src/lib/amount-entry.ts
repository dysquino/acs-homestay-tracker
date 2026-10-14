/**
 * Amount entry for the reconciliation command panel (§7.6).
 *
 * The owner is typing a figure off a bank statement, so the input has to be
 * forgiving about how they type it and strict about what it accepts: a decimal
 * point once, at most two decimals, a sign that toggles rather than stacks, and
 * no silent rounding of a third decimal place.
 *
 * Pure and separate from the component so the awkward cases — a leading dot,
 * two dots in a row, backspacing the sign — are unit-testable rather than only
 * reachable by hand.
 *
 * The displayed string is what the owner sees; the parsed value goes through
 * `toCentavos`, which rejects anything with a real third decimal.
 */

/** What the owner has typed so far. Empty string means "nothing entered". */
export type AmountEntry = {
  /** Digits and at most one dot, e.g. "8500" or "8500.5". No sign. */
  digits: string;
  /** Sign lives apart from the digits so toggling can never produce "--5". */
  negative: boolean;
};

export const EMPTY_ENTRY: AmountEntry = { digits: "", negative: false };

export type Key =
  | { type: "digit"; digit: string }
  | { type: "dot" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "toggle-sign" };

/**
 * Longest figure worth accepting: 10 digits before the decimal point, which
 * covers any peso amount above the Decimal(10, 2) ceiling with room to spare.
 */
const MAX_WHOLE_DIGITS = 10;

/** Press a keypad key. Returns the same entry when the key has no effect. */
export function applyKey(entry: AmountEntry, key: Key): AmountEntry {
  switch (key.type) {
    case "clear":
      return EMPTY_ENTRY;

    case "toggle-sign":
      // Toggling on an empty field would show "-₱0" and imply a negative amount
      // the owner never entered, so require a figure first.
      return entry.digits === "" ? entry : { ...entry, negative: !entry.negative };

    case "backspace": {
      if (entry.digits === "") return entry;
      return { ...entry, digits: entry.digits.slice(0, -1) };
    }

    case "dot": {
      if (entry.digits.includes(".")) return entry; // one dot, ever
      // ".5" reads as 0.5 rather than being rejected, which is what a numeric
      // keypad owner expects.
      return { ...entry, digits: entry.digits === "" ? "0." : `${entry.digits}.` };
    }

    case "digit": {
      const { digits } = entry;
      const [whole = "", fraction] = digits.split(".");
      if (fraction !== undefined) {
        // Two decimals already: refuse the third rather than round it, since
        // rounding would silently change a peso figure the owner read off a
        // statement.
        if (fraction.length >= 2) return entry;
        return { ...entry, digits: digits + key.digit };
      }
      if (digits === "0") {
        // Don't let "0" grow into "05".
        return { ...entry, digits: key.digit === "0" ? "0" : key.digit };
      }
      if (whole.replace(/^0/, "").length >= MAX_WHOLE_DIGITS) return entry;
      return { ...entry, digits: digits + key.digit };
    }
  }
}

/** Translate a hardware keyboard event into a key, or null if it isn't one. */
export function keyFromKeyboard(key: string): Key | null {
  if (/^\d$/.test(key)) return { type: "digit", digit: key };
  if (key === "." || key === ",") return { type: "dot" };
  if (key === "Backspace") return { type: "backspace" };
  if (key === "Escape") return { type: "clear" };
  if (key === "-") return { type: "toggle-sign" };
  return null;
}

/** The figure as a number, or null when nothing usable has been entered. */
export function entryToAmount(entry: AmountEntry): number | null {
  if (entry.digits === "" || entry.digits === ".") return null;
  const value = Number(entry.digits);
  if (!Number.isFinite(value)) return null;
  return entry.negative ? -value : value;
}

/** Peso-formatted display, or a blank prompt when nothing's entered. */
export function formatEntry(entry: AmountEntry): string {
  if (entry.digits === "") return "";
  const [whole = "", fraction] = entry.digits.split(".");
  const grouped = whole ? Number(whole).toLocaleString("en-PH") : "";
  const body = fraction !== undefined ? `${grouped}.${fraction}` : grouped;
  return `${entry.negative ? "−" : ""}₱${body}`;
}

/**
 * Pool items whose amount is exactly what was typed.
 *
 * Exactness is in centavos, not pesos: a statement reading ₱8,500.00 must not
 * suggest a receipt recorded as ₱8,499.99, and the reverse must not happen
 * either.
 *
 * Compared on ABSOLUTE value. Pool amounts are always positive — direction
 * lives in the source type, never in a sign — while the owner types a negative
 * to indicate they're working through outflows. Comparing signed values would
 * mean an outflow could never match anything, which is exactly what the sign
 * is for: choosing which pool to look in, not negating the figure.
 *
 * Multiple exact candidates returns all of them — the owner picks, because
 * picking for them would be guessing (§7.7).
 */
export function exactCandidates<T extends { amount: number }>(
  items: T[],
  entry: AmountEntry,
): T[] {
  const typed = entryToAmount(entry);
  if (typed === null) return [];
  const wanted = Math.round(Math.abs(typed) * 100);
  return items.filter((item) => Math.round(Math.abs(item.amount) * 100) === wanted);
}

/** True when something has been typed — drives whether Enter can match. */
export function hasAmount(entry: AmountEntry): boolean {
  return entryToAmount(entry) !== null;
}

/**
 * Turn a peso figure into keypad digits, the inverse of `formatEntry`.
 *
 * Used when the owner clicks a pool item: that transaction's amount becomes
 * what they "typed", so they can confirm immediately or adjust it. Trailing
 * ".00" is dropped (₱8,500 rather than ₱8,500.00) because that's how the figure
 * reads on a statement, and a leading zero is dropped so ".5" stays a half
 * peso rather than becoming "0.5".
 */
export function centsToDigits(amount: number): string {
  const fixed = amount.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/^0\./, ".");
}