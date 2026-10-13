import { sum, toCentavos } from "./finance";
import { isValidISODate } from "./validation";

/**
 * Rules for turning "this statement line matches that record" into a row the
 * database will accept. Kept pure and separate from the Prisma calls so the
 * parts that decide right-from-wrong are unit-testable — these are the checks
 * §7.9 and §14 require the server to make, and they are the only thing standing
 * between a typo and a corrupted reconciliation.
 */

/** Which way the money moved, from the source record's type alone. */
export type Direction = "INFLOW" | "OUTFLOW";

export type SourceType = "BOOKING_PAYMENT" | "EXPENSE_SETTLEMENT";

export class MatchError extends Error {}

/**
 * Direction is derived from the source type, never taken from the client.
 *
 * A receipt is always money in and a payout is always money out. Accepting a
 * client-supplied direction would let a mistyped flag silently inflate one
 * side of the month's totals — and the whole point of reconciliation is that
 * the two sides are trustworthy.
 */
export function directionFor(sourceType: SourceType): Direction {
  return sourceType === "BOOKING_PAYMENT" ? "INFLOW" : "OUTFLOW";
}

/**
 * How much of a source record is still available to match.
 *
 * `amountCentavos` is the record's own value; `matchedCentavos` is what live
 * matches already consume. Callers must read both inside the transaction that
 * writes the new match — reading the matched total before the write is exactly
 * the race §14 calls out.
 */
export function remainingCentavos(amountCentavos: bigint, matchedCentavos: bigint): bigint {
  const remaining = amountCentavos - matchedCentavos;
  return remaining > 0n ? remaining : 0n;
}

/**
 * Validate a requested match before it is written.
 *
 * Rejects a zero or negative amount (direction comes from the source type, so a
 * negative would be meaningless), and a match larger than what's left to
 * consume — which is what stops two people matching the same deposit from both
 * succeeding (§14: one wins, the other gets a clear conflict).
 */
export function validateMatchAmount(requestedCentavos: bigint, remaining: bigint): void {
  if (requestedCentavos <= 0n) {
    throw new MatchError("Enter an amount greater than zero.");
  }
  if (requestedCentavos > remaining) {
    throw new MatchError("That's more than the amount left to match.");
  }
}

/**
 * A `YYYY-MM-DD` string, or throw.
 *
 * Uses the shared `isValidISODate` rather than a shape-only regex here: a
 * regex accepts "2026-13-01" because 13 is two digits, and a bank-posting date
 * that isn't a real date would quietly land in the wrong month.
 */
export function assertBankPostedDate(value: string): string {
  if (!isValidISODate(value)) {
    throw new MatchError("Enter a valid bank posting date.");
  }
  return value;
}

/** Who is recording this, from the identity picker (§5.2 is attribution only). */
export function assertActor(value: string): string {
  const actor = value.trim();
  if (!actor) throw new MatchError("Couldn't tell who did this — pick your name first.");
  return actor.slice(0, 100);
}

/** Sum a batch of requested match amounts — used by grouped matches (§7.10). */
export function totalRequested(requests: Iterable<{ amountCentavos: bigint }>): bigint {
  return sum(Array.from(requests, (r) => r.amountCentavos));
}

/* ------------------------------------------------------------------ */
/* Adjustments — bank movements with no recorded transaction behind   */
/* them (§4.7). Rules kept here so they're unit-testable without a DB. */
/* ------------------------------------------------------------------ */

export type AdjustmentCategoryValue =
  | "BANK_FEE"
  | "BANK_INTEREST"
  | "CHARGEBACK"
  | "OWNER_CONTRIBUTION"
  | "OWNER_WITHDRAWAL"
  | "TRANSFER_CORRECTION"
  | "DUPLICATE_CORRECTION"
  | "OTHER";

/**
 * Validate the shape of an adjustment before it is written.
 *
 * Two rules worth stating:
 *
 * - Amount must be positive. Direction is separate, so a negative amount would
 *   be a double negative that quietly flips which side of the month's totals
 *   the money lands on.
 *
 * - The bank posting date is required and separate from the effective date.
 *   The posting date decides the month; the effective date is when the movement
 *   relates to. An adjustment whose only date is "sometime in July" would have
 *   no way to place itself in a statement period.
 */
export function validateAdjustment(input: {
  amountCentavos: bigint;
  description: string;
  effectiveDate: string;
  bankPostedDate: string;
}): void {
  if (input.amountCentavos <= 0n) {
    throw new MatchError("Enter an amount greater than zero.");
  }
  if (!input.description.trim()) {
    throw new MatchError("Give this a short description.");
  }
  if (input.description.length > 200) {
    throw new MatchError("Description is too long.");
  }
  assertBankPostedDate(input.bankPostedDate);
  assertBankPostedDate(input.effectiveDate);
}

/**
 * Categories that are always an inflow, and always an outflow.
 *
 * Offered as a default direction when picking a category, so "Bank interest"
 * doesn't have to be re-typed as an inflow every month. Still overridable —
 * a chargeback is normally money out, but the owner knows their statement.
 */
export const NATURAL_DIRECTION: Record<AdjustmentCategoryValue, "INFLOW" | "OUTFLOW"> = {
  BANK_FEE: "OUTFLOW",
  BANK_INTEREST: "INFLOW",
  CHARGEBACK: "OUTFLOW",
  OWNER_CONTRIBUTION: "INFLOW",
  OWNER_WITHDRAWAL: "OUTFLOW",
  TRANSFER_CORRECTION: "OUTFLOW",
  DUPLICATE_CORRECTION: "OUTFLOW",
  OTHER: "OUTFLOW",
};
/* ------------------------------------------------------------------ */
/* Batch / grouped matching (§7.10, §7.11)                            */
/* ------------------------------------------------------------------ */

/**
 * One row of a grouped match: which record, and how much of it this statement
 * line covers. Structurally identical to the grouped-match request, so the same
 * value goes to the UI's running totals and to the server's validation — there
 * is no second shape for the rules to disagree with.
 */
export type BatchCandidate = {
  sourceType: SourceType;
  sourceId: string;
  amount: number;
};

export type BatchTotals = {
  count: number;
  inflowCentavos: bigint;
  outflowCentavos: bigint;
  netCentavos: bigint;
};

/**
 * The pool's stored (Prisma) enum value → the match's source type.
 *
 * Lives here so the mapping is stated once. Getting it backwards would file a
 * receipt as a payout, and the direction is derived from the source type rather
 * than submitted — so a backwards mapping would invert the money without any
 * error being raised anywhere.
 */
export function matchSourceType(value: "booking_payment" | "expense_settlement"): SourceType {
  return value === "booking_payment" ? "BOOKING_PAYMENT" : "EXPENSE_SETTLEMENT";
}

/** Running totals for the batch bar (§7.11 wants count, in, out, and net). */
export function batchTotals(selected: BatchCandidate[]): BatchTotals {
  let inflowCentavos = 0n;
  let outflowCentavos = 0n;
  for (const item of selected) {
    const cents = toCentavos(item.amount);
    if (item.sourceType === "BOOKING_PAYMENT") inflowCentavos += cents;
    else outflowCentavos += cents;
  }
  return {
    count: selected.length,
    inflowCentavos,
    outflowCentavos,
    netCentavos: inflowCentavos - outflowCentavos,
  };
}

/**
 * Validate a grouped batch against the statement line it claims to be.
 *
 * Three rules, in the order that produces the most useful message:
 *
 * - Nothing selected means the owner hasn't actually picked a statement line.
 *
 * - A group must be all inflows or all outflows, never mixed. One statement line
 *   is one movement — a deposit or a debit, not both — so a mixed group would let
 *   a single `statementGroupKey` claim two opposite movements landed as one
 *   line, and the month's totals would stop meaning anything.
 *
 * - The records must add up to the amount on the statement, exactly. This is the
 *   rule that makes a group worth doing: the owner's typed figure is their
 *   transcription of the bank line, and the records are checked against it. A
 *   group that doesn't tie out isn't a reconciliation, it's a guess, so it's
 *   refused rather than stored with a difference nobody will notice until
 *   finalization demands an exact zero (§8.6).
 */
export function validateBatch(selected: BatchCandidate[], statementCentavos: bigint): void {
  const totals = batchTotals(selected);

  if (totals.count === 0) {
    throw new MatchError("Pick at least one transaction.");
  }
  if (totals.inflowCentavos > 0n && totals.outflowCentavos > 0n) {
    throw new MatchError(
      "One statement line is one direction — match either money in or money out, not both.",
    );
  }
  // Compare against the side that was selected, not the signed net. A group of
  // payouts nets negative while the statement figure is a positive amount of
  // pesos, so comparing the net would refuse every debit line.
  const selectedCentavos = totals.inflowCentavos > 0n ? totals.inflowCentavos : totals.outflowCentavos;
  if (selectedCentavos !== statementCentavos) {
    throw new MatchError(
      "Those transactions don't add up to the amount on your statement.",
    );
  }
}
