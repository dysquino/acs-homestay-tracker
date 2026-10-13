"use server";

import { prisma } from "@/lib/prisma";
import { toCentavos } from "@/lib/finance";
import {
  assertActor,
  assertBankPostedDate,
  directionFor,
  MatchError,
  remainingCentavos,
  validateAdjustment,
  validateBatch,
  validateMatchAmount,
  type AdjustmentCategoryValue,
  type SourceType,
} from "@/lib/reconciliation-match-rules";

import { requireSiteAccess } from "./access";
import { isoToDate } from "./mappers";
import { requireReconciliationEnabled } from "./reconciliation-status";

/**
 * Writing matches — the point at which a recorded transaction is declared to
 * have actually moved through the bank.
 *
 * Two invariants drive the shape of this file:
 *
 * 1. Direction is derived, never submitted (§7.9). A receipt is an inflow, a
 *    payout is an outflow; the client doesn't get a say, because a wrong
 *    direction quietly corrupts the month's totals and nothing would look
 *    broken until finalization.
 *
 * 2. The available amount is re-read INSIDE the transaction that writes the
 *    match (§14). Reading it beforehand is a race: two owners matching the same
 *    deposit would both see the full amount and both would succeed. Re-reading
 *    under the transaction means the first commit wins and the second is
 *    refused by the unique/serialized check, giving the "one success, one clear
 *    conflict" behaviour §14 asks for.
 */

export type CreateMatchInput = {
  sourceType: SourceType;
  sourceId: string;
  amount: number;
  /** `YYYY-MM-DD` — when it posted at the bank, which decides its month. */
  bankPostedDate: string;
  notes?: string;
  matchedBy: string;
  /**
   * Set when several matches share one statement line (one Airbnb payout
   * covering three stays). Callers that don't know the key yet pass nothing and
   * the server mints one.
   */
  statementGroupKey?: string;
};

export type CreateMatchResult = {
  id: string;
  statementGroupKey: string;
};

/** Does this source row exist, is it live, and what is its amount? */
async function readSource(
  tx: Tx,
  sourceType: SourceType,
  sourceId: string,
): Promise<{ amountCentavos: bigint }> {
  if (sourceType === "BOOKING_PAYMENT") {
    const row = await tx.bookingPayment.findUnique({
      where: { id: sourceId },
      select: { amount: true, status: true },
    });
    if (!row) throw new MatchError("That receipt no longer exists.");
    if (row.status !== "ACTIVE") {
      throw new MatchError("That receipt has been voided, so it can't be matched.");
    }
    return { amountCentavos: sumDecimal(row.amount) };
  }
  const row = await tx.expenseSettlement.findUnique({
    where: { id: sourceId },
    select: { amount: true, status: true },
  });
  if (!row) throw new MatchError("That payout no longer exists.");
  if (row.status !== "ACTIVE") {
    throw new MatchError("That payout has been voided, so it can't be matched.");
  }
  return { amountCentavos: sumDecimal(row.amount) };
}

/**
 * What live matches already consume against this source.
 *
 * Scoped to the source id rather than the month: a receipt matched in a
 * previous month is still consuming its value, and forgetting that would let
 * the same peso be matched twice across months.
 */
async function matchedAgainst(
  tx: Tx,
  sourceType: SourceType,
  sourceId: string,
): Promise<bigint> {
  const rows = await tx.reconciliationMatch.findMany({
    where: { sourceType, sourceId, reversedAt: null },
    select: { amount: true },
  });
  let total = 0n;
  for (const row of rows) total += sumDecimal(row.amount);
  return total;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function sumDecimal(value: { toString(): string }): bigint {
  return toCentavos(value.toString());
}

/**
 * Match one recorded transaction against one statement line.
 *
 * `amount` may be less than the record's own value, which is how a single
 * receipt split across two deposits works (§7.10). It may not exceed what's
 * left.
 */
export async function createMatch(input: CreateMatchInput): Promise<CreateMatchResult> {
  await requireSiteAccess();
  await requireReconciliationEnabled();

  const requested = toCentavos(input.amount);
  const bankPostedDate = assertBankPostedDate(input.bankPostedDate);
  const matchedBy = assertActor(input.matchedBy);

  const created = await prisma.$transaction(async (tx) => {
    const source = await readSource(tx, input.sourceType, input.sourceId);
    // Both reads happen here, inside the transaction — never before it.
    const already = await matchedAgainst(tx, input.sourceType, input.sourceId);
    const remaining = remainingCentavos(source.amountCentavos, already);
    validateMatchAmount(requested, remaining);

    const key = input.statementGroupKey || crypto.randomUUID();
    const row = await tx.reconciliationMatch.create({
      data: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        direction: directionFor(input.sourceType),
        amount: input.amount,
        bankPostedDate: isoToDate(bankPostedDate),
        statementGroupKey: key,
        notes: (input.notes ?? "").slice(0, 2000),
        matchedBy,
      },
      select: { id: true, statementGroupKey: true },
    });
    return { id: row.id, statementGroupKey: row.statementGroupKey ?? key };
  });

  return created;
}

export type GroupedMatchRequest = {
  sourceType: SourceType;
  sourceId: string;
  amount: number;
};

/**
 * Match several records to a single statement line.
 *
 * The case this exists for: Airbnb pays out three stays as one deposit. All
 * three receipts share one `statementGroupKey`, so the history view can show
 * them as one statement line rather than three unrelated matches (§4.3).
 *
 * `statementAmount` is the owner's transcription of the bank line, and the group
 * must add up to it exactly. Requiring it here rather than only in the UI means
 * a group can never claim a statement figure its own rows don't produce — the
 * check `validateBatch` makes is the same one the interface makes, so a caller
 * that skips the form still can't write a group that doesn't tie out.
 *
 * Either every record is matched or none is — a partial group would leave the
 * statement line looking like it didn't fully reconcile, which is worse than
 * failing outright.
 */
export async function createGroupedMatches(
  requests: GroupedMatchRequest[],
  input: {
    bankPostedDate: string;
    /** The figure read off the statement, which the group must total exactly. */
    statementAmount: number;
    notes?: string;
    matchedBy: string;
  },
): Promise<CreateMatchResult> {
  await requireSiteAccess();
  await requireReconciliationEnabled();

  const statementAmount = toCentavos(input.statementAmount);
  const bankPostedDate = assertBankPostedDate(input.bankPostedDate);
  const matchedBy = assertActor(input.matchedBy);
  // Shape and direction are decidable without a query, so refuse them before
  // opening a transaction rather than after.
  validateBatch(requests, statementAmount);
  const key = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    for (const request of requests) {
      const source = await readSource(tx, request.sourceType, request.sourceId);
      const already = await matchedAgainst(tx, request.sourceType, request.sourceId);
      const remaining = remainingCentavos(source.amountCentavos, already);
      validateMatchAmount(toCentavos(request.amount), remaining);
    }
    // Validated every record before writing any, so the group is all-or-nothing.
    for (const request of requests) {
      await tx.reconciliationMatch.create({
        data: {
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          direction: directionFor(request.sourceType),
          amount: request.amount,
          bankPostedDate: isoToDate(bankPostedDate),
          statementGroupKey: key,
          notes: (input.notes ?? "").slice(0, 2000),
          matchedBy,
        },
      });
    }
  });

  return { id: key, statementGroupKey: key };
}

/**
 * Undo a match, putting the record back in the pool.
 *
 * A reversal, never a delete (§7.13): the original match and the undo both stay
 * visible, and the amount becomes available to match again. Reversing twice is
 * a no-op rather than an error, so a double-tap can't corrupt anything.
 */
export async function reverseMatch(id: string, reversedBy: string, reason?: string): Promise<void> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  const actor = assertActor(reversedBy);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.reconciliationMatch.findUnique({ where: { id } });
    if (!existing) throw new MatchError("That match no longer exists.");
    if (existing.reversedAt) return; // already reversed — nothing to do
    await tx.reconciliationMatch.update({
      where: { id },
      data: {
        reversedAt: new Date(),
        reversedBy: actor,
        reversalReason: (reason ?? "").slice(0, 2000),
      },
    });
  });
}
/* ------------------------------------------------------------------ */
/* Adjustments — bank movements with no recorded transaction behind    */
/* them (§4.7, §7.12).                                                 */
/* ------------------------------------------------------------------ */

export type CreateAdjustmentInput = {
  direction: "INFLOW" | "OUTFLOW";
  category: AdjustmentCategoryValue;
  amount: number;
  /** When the movement relates to. */
  effectiveDate: string;
  /** When it posted to the bank — decides the month. */
  bankPostedDate: string;
  description: string;
  notes?: string;
  createdBy: string;
};

/**
 * Record a bank movement that no booking or expense explains.
 *
 * This is the escape hatch that makes reconciliation honest: a service charge,
 * interest, an owner's cash-in, a transfer that landed twice. Without it an
 * unexplained statement line has nowhere to go, and the owner either forces it
 * into an unrelated record or gives up on reconciling the month (§3.2).
 *
 * An adjustment explains a movement; it never fabricates the booking or
 * expense that supposedly caused it (§4.7). It carries its own bank posting
 * date, so it lands in that month's totals directly — there's no second
 * "match it" step.
 */
export async function createAdjustment(
  input: CreateAdjustmentInput,
): Promise<{ id: string }> {
  await requireSiteAccess();
  await requireReconciliationEnabled();

  validateAdjustment({
    amountCentavos: toCentavos(input.amount),
    description: input.description,
    effectiveDate: input.effectiveDate,
    bankPostedDate: input.bankPostedDate,
  });
  const createdBy = assertActor(input.createdBy);

  const row = await prisma.reconciliationAdjustment.create({
    data: {
      direction: input.direction,
      category: input.category,
      amount: input.amount,
      effectiveDate: isoToDate(input.effectiveDate),
      bankPostedDate: isoToDate(input.bankPostedDate),
      description: input.description.trim().slice(0, 200),
      notes: (input.notes ?? "").slice(0, 2000),
      createdBy,
    },
    select: { id: true },
  });
  return row;
}

/** Void an adjustment rather than deleting it — §7.13 applies here too. */
export async function voidAdjustment(id: string, voidedBy: string): Promise<void> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  const actor = assertActor(voidedBy);

  const existing = await prisma.reconciliationAdjustment.findUnique({ where: { id } });
  if (!existing) throw new MatchError("That adjustment no longer exists.");
  if (existing.status === "VOIDED") return; // idempotent

  await prisma.reconciliationAdjustment.update({
    where: { id },
    data: { status: "VOIDED", voidedAt: new Date(), voidedBy: actor },
  });
}
