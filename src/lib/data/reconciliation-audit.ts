"use server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toAmount, toCentavos } from "@/lib/finance";
import { assertActor, MatchError, type Direction } from "@/lib/reconciliation-match-rules";
import {
  buildLedger,
  calculatePeriodTotals,
  canFinalize,
  categoryFor,
  CATEGORY_LABELS,
  finalizationBlocker,
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  periodMonthStart,
  type LedgerRow,
  type OutstandingItem,
  type PeriodCategory,
  type ReconciledItem,
} from "@/lib/reconciliation-period";
import { buildPool, poolKey, type MatchedTotals, type PoolRecord } from "@/lib/reconciliation-pool";

import { requireSiteAccess } from "./access";
import { dateToISO, isoToDate } from "./mappers";
import { recordAudit, type Tx } from "./reconciliation-periods";
import { requireReconciliationEnabled } from "./reconciliation-status";

/**
 * The Monthly Audit read model and the two operations that make it mean
 * something: sealing a month, and reopening one.
 *
 * The governing rule from §8.9 is that **nothing a client sends is trusted**.
 * Every figure here is reloaded from the matches, adjustments and source
 * records inside the transaction that seals the month. A client that computed a
 * tidy zero and posted it would be refused, and a client that computed a wrong
 * zero would be ignored — the only difference is which number ends up stored.
 */

type PeriodRow = {
  id: string;
  month: Date;
  status: "DRAFT" | "FINALIZED" | "REOPENED";
  startingBalance: { toString(): string };
  endingBalance: { toString(): string };
  version: number;
};

/**
 * Everything the audit needs about a period, reloaded from authoritative rows.
 *
 * Runs inside the caller's transaction so that finalization sees exactly the
 * matches that existed when it decided to seal, not a set that shifts underneath.
 */
async function loadAuditData(tx: Tx, period: PeriodRow) {
  const [matches, adjustments] = await Promise.all([
    tx.reconciliationMatch.findMany({
      where: { periodId: period.id, reversedAt: null },
      orderBy: [{ matchedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        direction: true,
        amount: true,
        bankPostedDate: true,
        statementGroupKey: true,
        matchedBy: true,
        matchedAt: true,
      },
    }),
    tx.reconciliationAdjustment.findMany({
      where: { periodId: period.id, status: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        direction: true,
        category: true,
        amount: true,
        effectiveDate: true,
        bankPostedDate: true,
        description: true,
        createdBy: true,
        createdAt: true,
      },
    }),
  ]);

  // Labels come from whichever table a row points at, resolved in two queries
  // rather than one per match.
  const paymentIds = matches
    .filter((m) => m.sourceType === "BOOKING_PAYMENT")
    .map((m) => m.sourceId);
  const settlementIds = matches
    .filter((m) => m.sourceType === "EXPENSE_SETTLEMENT")
    .map((m) => m.sourceId);

  const [payments, settlements] = await Promise.all([
    paymentIds.length
      ? tx.bookingPayment.findMany({
          where: { id: { in: paymentIds } },
          select: {
            id: true,
            amount: true,
            receivedDate: true,
            booking: { select: { guestName: true, source: true } },
          },
        })
      : [],
    settlementIds.length
      ? tx.expenseSettlement.findMany({
          where: { id: { in: settlementIds } },
          select: {
            id: true,
            amount: true,
            paidDate: true,
            settlementType: true,
            reimbursedTo: true,
            expense: { select: { description: true } },
            refundForBooking: { select: { guestName: true } },
          },
        })
      : [],
  ]);

  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const settlementById = new Map(settlements.map((s) => [s.id, s]));

  const SETTLEMENT_LABEL: Record<string, string> = {
    DIRECT_VENDOR_PAYMENT: "Paid vendor",
    OWNER_REIMBURSEMENT: "Reimbursement",
    CLEANER_PAYMENT: "Cleaner",
    GUEST_REFUND: "Guest refund",
    OTHER: "Other",
  };

  // One shared sequence across matches and adjustments, so two items on the same
  // posting date keep a fixed order that does not depend on which query ran first.
  const ordered = [
    ...matches.map((m) => ({ at: m.matchedAt.getTime(), id: m.id })),
    ...adjustments.map((a) => ({ at: a.createdAt.getTime(), id: a.id })),
  ]
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
  const sequenceOf = new Map(ordered.map((id, index) => [id, index + 1]));

  const items: ReconciledItem[] = [];

  for (const m of matches) {
    const sourceType =
      m.sourceType === "BOOKING_PAYMENT" ? "BOOKING_PAYMENT" : "EXPENSE_SETTLEMENT";
    let label = "Deleted record";
    let detail = "";
    let recordDate = dateToISO(m.bankPostedDate);
    let bookingSource: string | null = null;
    let settlementType: string | null = null;

    if (m.sourceType === "BOOKING_PAYMENT") {
      const p = paymentById.get(m.sourceId);
      if (p) {
        label = p.booking.guestName;
        detail = p.booking.source === "AIRBNB" ? "Airbnb" : "Direct";
        recordDate = dateToISO(p.receivedDate);
        bookingSource = p.booking.source;
      }
    } else {
      const s = settlementById.get(m.sourceId);
      if (s) {
        label = s.refundForBooking?.guestName ?? s.expense?.description ?? "Refund";
        detail = s.reimbursedTo
          ? `Reimbursed ${s.reimbursedTo}`
          : (SETTLEMENT_LABEL[s.settlementType] ?? "Other");
        recordDate = dateToISO(s.paidDate);
        settlementType = s.settlementType;
      }
    }

    const category = categoryFor({
      sourceType,
      direction: m.direction as Direction,
      bookingSource,
      settlementType,
    });
    items.push({
      sourceType,
      sourceId: m.sourceId,
      direction: m.direction as Direction,
      amount: toAmount(toCentavos(m.amount.toString())),
      category,
      bankPostedDate: dateToISO(m.bankPostedDate),
      recordDate,
      label,
      detail,
      recordedBy: m.matchedBy,
      reference: m.id,
      sequence: sequenceOf.get(m.id) ?? 0,
      statementGroupKey: m.statementGroupKey,
    });
  }

  for (const a of adjustments) {
    items.push({
      sourceType: "ADJUSTMENT",
      sourceId: a.id,
      direction: a.direction as Direction,
      amount: toAmount(toCentavos(a.amount.toString())),
      category: categoryFor({
        sourceType: "ADJUSTMENT",
        direction: a.direction as Direction,
        adjustmentCategory: a.category,
      }),
      bankPostedDate: dateToISO(a.bankPostedDate),
      recordDate: dateToISO(a.effectiveDate),
      label: a.description,
      detail: "Adjustment",
      recordedBy: a.createdBy,
      reference: a.id,
      sequence: sequenceOf.get(a.id) ?? 0,
      statementGroupKey: null,
    });
  }

  // Outstanding is across every live match, not just this period's — a record
  // left partly unmatched stays outstanding wherever it was recorded.
  const allMatched = await tx.reconciliationMatch.findMany({
    where: { reversedAt: null },
    select: { sourceType: true, sourceId: true, amount: true },
  });
  const matchedTotals: MatchedTotals = new Map();
  for (const row of allMatched) {
    const st = row.sourceType === "BOOKING_PAYMENT" ? "booking_payment" : "expense_settlement";
    const key = poolKey(st, row.sourceId);
    matchedTotals.set(key, (matchedTotals.get(key) ?? 0n) + toCentavos(row.amount.toString()));
  }

  const monthKey = period.month.toISOString().slice(0, 7);
  const outstandingRecords: PoolRecord[] = [
    ...payments
      .filter((p) => dateToISO(p.receivedDate).slice(0, 7) === monthKey)
      .map((p) => ({
        id: p.id,
        sourceType: "booking_payment" as const,
        amountCentavos: toCentavos(p.amount.toString()),
        recordDate: dateToISO(p.receivedDate),
        label: p.booking.guestName,
        detail: p.booking.source === "AIRBNB" ? "Airbnb" : "Direct",
        reference: "",
      })),
    ...settlements
      .filter((s) => dateToISO(s.paidDate).slice(0, 7) === monthKey)
      .map((s) => ({
        id: s.id,
        sourceType: "expense_settlement" as const,
        amountCentavos: toCentavos(s.amount.toString()),
        recordDate: dateToISO(s.paidDate),
        label: s.refundForBooking?.guestName ?? s.expense?.description ?? "Refund",
        detail: SETTLEMENT_LABEL[s.settlementType] ?? "Other",
        reference: "",
      })),
  ];

  const outstanding: OutstandingItem[] = buildPool(outstandingRecords, matchedTotals, monthKey).map(
    (p) => ({
      sourceType: p.sourceType === "booking_payment" ? "BOOKING_PAYMENT" : "EXPENSE_SETTLEMENT",
      sourceId: p.sourceId,
      direction: p.sourceType === "booking_payment" ? "INFLOW" : "OUTFLOW",
      amount: p.amount,
      label: p.label,
      detail: p.detail,
      recordDate: p.date,
    }),
  );

  return { items, outstanding };
}

export type AuditView = {
  month: string;
  status: "DRAFT" | "FINALIZED" | "REOPENED";
  version: number;
  startingBalance: number;
  endingBalance: number;
  totals: ReturnType<typeof calculatePeriodTotals>;
  ledger: LedgerRow[];
  outstanding: OutstandingItem[];
  blocker: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
};

/** The Verify stage's view: totals, ledger, outstanding, and whether it can seal. */
export async function getAudit(month: string): Promise<AuditView | null> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");

  const period = await prisma.reconciliationPeriod.findUnique({
    where: { month: isoToDate(periodMonthStart(`${month}-01`)) },
  });
  if (!period) return null;

  const { items, outstanding } = await loadAuditData(prisma, period);
  const starting = toAmount(toCentavos(period.startingBalance.toString()));
  const ending = toAmount(toCentavos(period.endingBalance.toString()));
  const totals = calculatePeriodTotals({ startingBalance: starting, endingBalance: ending, items, outstanding });

  return {
    month,
    status: period.status,
    version: period.version,
    startingBalance: starting,
    endingBalance: ending,
    totals,
    ledger: buildLedger(totals.startingBalanceCentavos, items),
    outstanding,
    blocker: finalizationBlocker(totals),
    finalizedAt: period.finalizedAt?.toISOString() ?? null,
    finalizedBy: period.finalizedBy,
  };
}

/**
 * Seal a month (§8.9).
 *
 * Order matters and is deliberate:
 *
 * 1. Reload the period, the matches, the adjustments and the source records
 *    inside one transaction — the client sends none of the totals.
 * 2. Recalculate and validate the difference, *before* anything is written, so a
 *    month that doesn't tie out leaves no trace.
 * 3. Claim the period with a conditional update. This is the concurrency guard:
 *    `where status != FINALIZED` is evaluated by the database at write time, so
 *    of two simultaneous finalizations exactly one matches a row and the other
 *    gets zero rows back and is refused. Reading the status earlier and trusting
 *    it would let both through.
 * 4. Write the immutable snapshot, then the audit event.
 */
export async function finalizePeriod(
  month: string,
  input: { acknowledgeOutstanding: boolean },
  actor: string,
): Promise<{ version: number; difference: number }> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");
  const who = assertActor(actor);

  return prisma.$transaction(async (tx) => {
    const period = await tx.reconciliationPeriod.findUnique({
      where: { month: isoToDate(periodMonthStart(`${month}-01`)) },
    });
    if (!period) throw new MatchError(`${month} hasn't been started yet.`);
    if (period.status === "FINALIZED") {
      throw new MatchError(`${month} is already finalized.`);
    }

    const { items, outstanding } = await loadAuditData(tx, period);

    const starting = toAmount(toCentavos(period.startingBalance.toString()));
    const ending = toAmount(toCentavos(period.endingBalance.toString()));
    const totals = calculatePeriodTotals({
      startingBalance: starting,
      endingBalance: ending,
      items,
      outstanding,
    });

    if (!canFinalize(totals)) {
      throw new MatchError(finalizationBlocker(totals) ?? "This month doesn't balance.");
    }

    // §8.8 lets a month seal with items still outstanding, but only if the owner
    // was shown the count and value and said so. The snapshot keeps them, so
    // "they were outstanding" is still true after the fact.
    if (outstanding.length > 0 && !input.acknowledgeOutstanding) {
      throw new MatchError(
        `${outstanding.length} transaction${outstanding.length === 1 ? " is" : "s are"} still outstanding. Acknowledge them before finalizing.`,
      );
    }

    const claimed = await tx.reconciliationPeriod.updateMany({
      where: { id: period.id, status: { not: "FINALIZED" } },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
        finalizedBy: who,
        calculatedBalance: toAmount(totals.calculatedBalanceCentavos),
        difference: toAmount(totals.differenceCentavos),
      },
    });
    if (claimed.count === 0) {
      throw new MatchError(`${month} was finalized by someone else a moment ago.`);
    }

    // The version the snapshot is filed under. A reopen already bumped it, so
    // this is the period's current version — bumping again here would skip a
    // number in the version history.
    const snapshotVersion = period.version;

    await tx.reconciliationSnapshot.create({
      data: {
        periodId: period.id,
        version: snapshotVersion,
        // Who sealed it, recorded on the snapshot itself so the report stays
        // attributable even if the period row is later reopened.
        finalizedBy: who,
        summaryJson: snapshotSummary(period, totals),
        ledgerJson: snapshotLedger(totals.startingBalanceCentavos, items),
        outstandingJson: outstanding as unknown as Prisma.InputJsonValue,
      },
    });

    await recordAudit(tx, {
      periodId: period.id,
      eventType: period.status === "REOPENED" ? "PERIOD_REFINALIZED" : "PERIOD_FINALIZED",
      actor: who,
      metadata: {
        version: snapshotVersion,
        difference: toAmount(totals.differenceCentavos),
        outstandingCount: outstanding.length,
        acknowledgedOutstanding: outstanding.length > 0,
      },
    });

    return {
      version: snapshotVersion,
      difference: toAmount(totals.differenceCentavos),
    };
  });
}

/**
 * Reopen a sealed month (§8.11).
 *
 * The previous snapshot is left untouched — it is the record of what was
 * certified — and the version is bumped so the next finalization writes a new
 * one rather than overwriting this one. `finalizedAt`/`finalizedBy` and the
 * calculated figures are cleared because the month is no longer sealed, and
 * leaving a stale difference on the row would invite reading it as current.
 */
export async function reopenPeriod(month: string, reason: string, actor: string): Promise<void> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");
  const who = assertActor(actor);
  const trimmed = reason.trim();
  // A correction with no stated reason is not reviewable later, which is the
  // whole point of keeping a history.
  if (!trimmed) throw new MatchError("Say why this month is being reopened.");

  await prisma.$transaction(async (tx) => {
    const period = await tx.reconciliationPeriod.findUnique({
      where: { month: isoToDate(periodMonthStart(`${month}-01`)) },
    });
    if (!period) throw new MatchError(`${month} hasn't been started yet.`);
    if (period.status !== "FINALIZED") {
      throw new MatchError(`${month} isn't finalized, so there's nothing to reopen.`);
    }

    const reopened = await tx.reconciliationPeriod.updateMany({
      where: { id: period.id, status: "FINALIZED" },
      data: {
        status: "REOPENED",
        reopenedAt: new Date(),
        reopenedBy: who,
        reopenReason: trimmed.slice(0, 2000),
        version: { increment: 1 },
        finalizedAt: null,
        finalizedBy: null,
        calculatedBalance: null,
        difference: null,
      },
    });
    if (reopened.count === 0) {
      throw new MatchError(`${month} was already reopened by someone else.`);
    }

    await recordAudit(tx, {
      periodId: period.id,
      eventType: "PERIOD_REOPENED",
      actor: who,
      reason: trimmed,
      metadata: { version: period.version + 1 },
    });
  });
}

/** Prior finalized versions of a month, newest first (§8.11 history). */
export async function getSnapshotVersions(month: string): Promise<
  { version: number; finalizedAt: string; finalizedBy: string; outstandingCount: number }[]
> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");

  const period = await prisma.reconciliationPeriod.findUnique({
    where: { month: isoToDate(periodMonthStart(`${month}-01`)) },
    select: { id: true },
  });
  if (!period) return [];

  const rows = await prisma.reconciliationSnapshot.findMany({
    where: { periodId: period.id },
    orderBy: { version: "desc" },
    select: { version: true, finalizedAt: true, finalizedBy: true, outstandingJson: true },
  });
  return rows.map((r) => ({
    version: r.version,
    finalizedAt: r.finalizedAt.toISOString(),
    finalizedBy: r.finalizedBy,
    outstandingCount: Array.isArray(r.outstandingJson) ? r.outstandingJson.length : 0,
  }));
}

export type SnapshotReport = {
  version: number;
  finalizedAt: string;
  finalizedBy: string;
  /** The frozen figures, exactly as certified — never recomputed. */
  summary: Prisma.JsonValue;
  ledger: Prisma.JsonValue;
  outstanding: Prisma.JsonValue;
};

/**
 * Load one frozen report by version.
 *
 * Reads the snapshot rather than reconstructing from live rows, which is the
 * whole point of storing it (§11.6): if a guest is renamed or an expense
 * description edited since, a reconstructed "v1" would show today's wording
 * against last month's numbers. Here it shows what was actually certified.
 */
export async function getSnapshotReport(
  month: string,
  version: number,
): Promise<SnapshotReport | null> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");
  if (!Number.isInteger(version) || version < 1) throw new Error("Version must be a positive integer.");

  const period = await prisma.reconciliationPeriod.findUnique({
    where: { month: isoToDate(periodMonthStart(`${month}-01`)) },
    select: { id: true },
  });
  if (!period) return null;

  const snap = await prisma.reconciliationSnapshot.findUnique({
    where: { periodId_version: { periodId: period.id, version } },
    select: {
      version: true,
      finalizedAt: true,
      finalizedBy: true,
      summaryJson: true,
      ledgerJson: true,
      outstandingJson: true,
    },
  });
  if (!snap) return null;

  return {
    version: snap.version,
    finalizedAt: snap.finalizedAt.toISOString(),
    finalizedBy: snap.finalizedBy,
    summary: snap.summaryJson,
    ledger: snap.ledgerJson,
    outstanding: snap.outstandingJson,
  };
}

function snapshotSummary(period: PeriodRow, totals: ReturnType<typeof calculatePeriodTotals>) {
  return {
    month: period.month.toISOString().slice(0, 7),
    startingBalance: toAmount(toCentavos(period.startingBalance.toString())),
    endingBalance: toAmount(toCentavos(period.endingBalance.toString())),
    calculatedBalance: toAmount(totals.calculatedBalanceCentavos),
    difference: toAmount(totals.differenceCentavos),
    totalInflow: toAmount(totals.totalInflowCentavos),
    totalOutflow: toAmount(totals.totalOutflowCentavos),
    matchedCount: totals.matchedCount,
    outstandingCount: totals.outstandingCount,
    outstandingValue: toAmount(totals.outstandingValueCentavos),
    categories: (Object.keys(CATEGORY_LABELS) as PeriodCategory[]).map((c) => ({
      category: c,
      label: CATEGORY_LABELS[c],
      amount: toAmount(totals.byCategory[c]),
    })),
    inflowCategories: INFLOW_CATEGORIES,
    outflowCategories: OUTFLOW_CATEGORIES,
  } as Prisma.InputJsonObject;
}

function snapshotLedger(startingCentavos: bigint, items: ReconciledItem[]) {
  return buildLedger(startingCentavos, items).map(
    (r) =>
      ({
        kind: r.kind,
        bankPostedDate: r.bankPostedDate,
        recordDate: r.recordDate,
        category: r.category,
        label: r.label,
        detail: r.detail,
        inflow: toAmount(r.inflowCentavos),
        outflow: toAmount(r.outflowCentavos),
        runningBalance: toAmount(r.runningBalanceCentavos),
        recordedBy: r.recordedBy,
        reference: r.reference,
        statementGroupKey: r.statementGroupKey,
      }) as Prisma.InputJsonObject,
  );
}