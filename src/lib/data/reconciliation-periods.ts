"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toCentavos, toAmount } from "@/lib/finance";
import { assertActor, MatchError } from "@/lib/reconciliation-match-rules";
import { startOfMonth } from "@/lib/dates";

import { requireSiteAccess } from "./access";
import { isoToDate } from "./mappers";
import { requireReconciliationEnabled } from "./reconciliation-status";

/**
 * The reconciliation period: one month of audit, and the gate every
 * reconciliation write passes through.
 *
 * Two things live here that nothing else can do:
 *
 * 1. **Resolving which period a write belongs to.** A match is filed under the
 *    month of its bank posting date, not the month the owner happened to be
 *    looking at. Deriving that per write — rather than trusting a client-sent
 *    period id — means a match can never be attributed to a month it didn't
 *    post in, which would quietly move money between two audits.
 *
 * 2. **Refusing writes to a sealed month** (§8.10). The check happens inside
 *    the caller's transaction, against a freshly-read row, so a match cannot
 *    land in a month that was being finalized at the same moment. Reading the
 *    status earlier and trusting it would be exactly the race §14 warns about.
 */

/**
 * `YYYY-MM-DD` → the UTC-midnight Date stored as the period's month.
 *
 * Private rather than exported: this is a `"use server"` module, where Next
 * requires every export to be an async function, and this is a pure helper. It
 * lives in `@/lib/dates` conceptually — this is just the one place the period's
 * month key is derived, so there is a single answer to what a month is.
 */
function monthStartDate(dateISO: string): Date {
  return isoToDate(startOfMonth(dateISO));
}

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Find the period for a bank-posting month, creating a draft if there isn't one.
 *
 * Auto-creating is deliberate: the owner never picks a period, they pick a month
 * and a date, and asking them to also create the month first would be a step
 * that exists only to satisfy the schema. The `DRAFT_CREATED` event records it.
 */
async function findOrCreate(
  tx: Tx,
  month: Date,
  actor: string,
): Promise<{ id: string; status: "DRAFT" | "FINALIZED" | "REOPENED" }> {
  const existing = await tx.reconciliationPeriod.findUnique({
    where: { month },
    select: { id: true, status: true },
  });
  if (existing) return existing;

  const created = await tx.reconciliationPeriod.create({
    data: { month, status: "DRAFT" },
    select: { id: true, status: true },
  });
  await tx.reconciliationAuditEvent.create({
    data: {
      periodId: created.id,
      eventType: "DRAFT_CREATED",
      actor,
      metadataJson: { month: month.toISOString().slice(0, 7) },
    },
  });
  return created;
}

/**
 * Resolve the period a write belongs to, refusing a sealed one.
 *
 * Must be called inside the transaction that performs the write — that is what
 * makes the finalized check meaningful.
 */
export async function resolveWritablePeriod(
  tx: Tx,
  bankPostedDateISO: string,
  actor: string,
): Promise<string> {
  const period = await findOrCreate(tx, monthStartDate(bankPostedDateISO), actor);
  if (period.status === "FINALIZED") {
    const month = monthStartDate(bankPostedDateISO).toISOString().slice(0, 7);
    throw new MatchError(
      `${month} is already finalized. Reopen it before changing anything.`,
    );
  }
  return period.id;
}

/** Append to the audit trail. Never throws — losing an event must not lose a write. */
export async function recordAudit(
  tx: Tx,
  event: {
    periodId: string | null;
    eventType:
      | "DRAFT_CREATED"
      | "MATCH_CREATED"
      | "MATCH_REVERSED"
      | "ADJUSTMENT_CREATED"
      | "ADJUSTMENT_VOIDED"
      | "PERIOD_FINALIZED"
      | "PERIOD_REOPENED"
      | "PERIOD_REFINALIZED";
    actor: string;
    reason?: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await tx.reconciliationAuditEvent.create({
    data: {
      periodId: event.periodId,
      eventType: event.eventType,
      actor: event.actor,
      reason: event.reason?.slice(0, 2000) ?? null,
      metadataJson: event.metadata ?? undefined,
    },
  });
}

export type PeriodView = {
  month: string;
  status: "DRAFT" | "FINALIZED" | "REOPENED";
  startingBalance: number;
  endingBalance: number;
  calculatedBalance: number | null;
  difference: number | null;
  statementClosingDate: string | null;
  statementReference: string | null;
  notes: string;
  version: number;
  /** Sent back on save so a concurrent edit is caught rather than overwritten. */
  updatedAt: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
};

/**
 * Read a month's period, or null when the month has never been worked on.
 *
 * Deliberately does not create: showing "no period yet" is different from
 * showing a draft, and reading a month must never have the side effect of
 * starting one.
 */
export async function getPeriod(month: string): Promise<PeriodView | null> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");

  const row = await prisma.reconciliationPeriod.findUnique({
    where: { month: monthStartDate(`${month}-01`) },
  });
  if (!row) return null;

  return {
    month,
    status: row.status,
    startingBalance: toAmount(toCentavos(row.startingBalance.toString())),
    endingBalance: toAmount(toCentavos(row.endingBalance.toString())),
    calculatedBalance: row.calculatedBalance
      ? toAmount(toCentavos(row.calculatedBalance.toString()))
      : null,
    difference: row.difference ? toAmount(toCentavos(row.difference.toString())) : null,
    statementClosingDate: row.statementClosingDate
      ? row.statementClosingDate.toISOString().slice(0, 10)
      : null,
    statementReference: row.statementReference,
    notes: row.notes,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    finalizedBy: row.finalizedBy,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    reopenedBy: row.reopenedBy,
    reopenReason: row.reopenReason,
  };
}

export type StatementSetupInput = {
  month: string;
  startingBalance: number;
  endingBalance: number;
  statementClosingDate?: string | null;
  statementReference?: string | null;
  notes?: string;
  /**
   * The `updatedAt` the editor was looking at.
   *
   * §14 asks for a version check on draft updates because more than one person
   * can be in the wizard at once. Without it, two owners editing the same
   * statement silently produce last-write-wins: the second save overwrites the
   * first owner's balances with no indication that anything was lost, and the
   * month then ties out against figures nobody meant to write. Finalization is
   * already protected by its own compare-and-set; this protects editing.
   */
  expectedUpdatedAt?: string;
};

/**
 * Save the statement setup (§8.3).
 *
 * Drafts save as the owner types, so this is written often and must not demand
 * completeness — a half-filled statement is a normal intermediate state, and
 * refusing to save one is what makes people lose the figures they typed.
 *
 * Balances are validated as exact cents here and stored as decimals, never
 * parsed through a float on the way in.
 */
export async function updateStatementSetup(
  input: StatementSetupInput,
  actor: string,
): Promise<PeriodView> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("Month must be YYYY-MM.");
  const who = assertActor(actor);

  // Negative balances are allowed — an overdraft month is real (§8.3) — but
  // sub-centavo values are not, and toCentavos is what refuses them.
  const starting = toCentavos(input.startingBalance);
  const ending = toCentavos(input.endingBalance);

  await prisma.$transaction(async (tx) => {
    const period = await findOrCreate(tx, monthStartDate(`${input.month}-01`), who);
    if (period.status === "FINALIZED") {
      throw new MatchError(`${input.month} is already finalized. Reopen it to make changes.`);
    }

    // Conditional update rather than update-by-id: the `updatedAt` equality is
    // evaluated by the database at write time, so of two people saving at once
    // exactly one matches the row and the other is told the month moved on.
    const changed = await tx.reconciliationPeriod.updateMany({
      where: {
        id: period.id,
        ...(input.expectedUpdatedAt ? { updatedAt: new Date(input.expectedUpdatedAt) } : {}),
      },
      data: {
        startingBalance: toAmount(starting),
        endingBalance: toAmount(ending),
        statementClosingDate: input.statementClosingDate
          ? isoToDate(input.statementClosingDate)
          : null,
        statementReference: input.statementReference?.trim().slice(0, 200) ?? null,
        notes: (input.notes ?? "").slice(0, 2000),
      },
    });

    if (changed.count === 0) {
      throw new MatchError(
        "Someone else changed this month while you were editing it. Reload and try again so you don't overwrite their figures.",
      );
    }
  });

  const view = await getPeriod(input.month);
  if (!view) throw new Error("Couldn't load the period after saving.");
  return view;
}

/**
 * The most recent finalized month before `month`, for the starting-balance
 * suggestion (§8.3).
 *
 * Returns the ending balance only — a suggestion is the previous closing
 * figure, and pulling in anything else would be guessing on the owner's behalf.
 */
export async function getPreviousFinalizedEndingBalance(
  month: string,
): Promise<{ month: string; endingBalance: number } | null> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");

  const row = await prisma.reconciliationPeriod.findFirst({
    where: { status: "FINALIZED", month: { lt: monthStartDate(`${month}-01`) } },
    orderBy: { month: "desc" },
    select: { month: true, endingBalance: true },
  });
  if (!row) return null;
  return {
    month: row.month.toISOString().slice(0, 7),
    endingBalance: toAmount(toCentavos(row.endingBalance.toString())),
  };
}