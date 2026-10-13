import { sum } from "./finance";
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