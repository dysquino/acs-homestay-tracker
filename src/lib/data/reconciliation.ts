"use server";

import { prisma } from "@/lib/prisma";
import { sum } from "@/lib/finance";
import type { PoolKind } from "@/lib/reconciliation-filters";
import { requireReconciliationEnabled } from "./reconciliation-status";

import { requireSiteAccess } from "./access";
import { addMonths, startOfMonth } from "@/lib/dates";

import { dateToISO, isoToDate } from "./mappers";

/**
 * Read side of the reconciliation workspace (§7): for one month, which
 * recorded transactions are still waiting to be matched to the bank, and which
 * have already been matched.
 *
 * Deliberately read-only for Phase 2. The matching *writes* (create / reverse /
 * grouped) land with the workspace UI so they can be reviewed against a real
 * statement rather than shipped ahead of it.
 *
 * Everything is scoped by the source record's own date — the date money
 * arrived, or the date it left — because that's what decides which pool a
 * transaction waits in. The month a match *lands* in is its bankPostedDate,
 * which is a different question (see the ReconciliationMatch model comment).
 */

export type PoolItem = {
  /** Stable key for React and for selection: `${sourceType}:${id}`. */
  key: string;
  sourceType: "booking_payment" | "expense_settlement";
  sourceId: string;
  amount: number;
  /** The source record's own date (receivedDate / paidDate). */
  date: string;
  /** Booking guest, expense description, or payee. */
  label: string;
  /** Secondary line: source, category, or who was reimbursed. */
  detail: string;
  /** Bank / Airbnb reference when recorded. */
  reference: string;
  /** True when the record's own date is before the selected month. */
  older: boolean;
  /**
   * Which of the three record kinds this is — what the pool filters slice on
   * (§7.5). A guest refund is separated from an ordinary payout because money
   * going back to a guest is a different question from money going to a vendor,
   * and chasing one while the other sits in the list is the usual way a month
   * gets reconciled unevenly.
   */
  kind: PoolKind;
};

export type MatchedItem = {
  key: string;
  sourceType: PoolItem["sourceType"] | "adjustment";
  sourceId: string;
  amount: number;
  bankPostedDate: string;
  label: string;
  detail: string;
  matchedBy: string;
  matchedAt: string;
  statementGroupKey: string | null;
};

export type WorkspaceMonth = {
  month: string; // YYYY-MM
  inflows: PoolItem[];
  outflows: PoolItem[];
  history: MatchedItem[];
  /** Exact-centavo totals (pesos) for the header. */
  matchedInTotal: number;
  matchedOutTotal: number;
  unmatchedInCount: number;
  unmatchedOutCount: number;
  unmatchedInTotal: number;
  unmatchedOutTotal: number;
  /** Transactions carried over from an earlier month, in each pool. */
  olderInCount: number;
  olderOutCount: number;
};

/** 'YYYY-MM' for a `YYYY-MM-DD` string. */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Inclusive start of a 'YYYY-MM' as a UTC-midnight Date. */
function monthStart(month: string): Date {
  return isoToDate(`${month}-01`);
}

/**
 * First instant of the month AFTER `month`, so a query can use `lt:`.
 * Reuses the shared date helpers rather than re-deriving year rollover.
 */
function nextMonthStart(month: string): Date {
  return isoToDate(startOfMonth(addMonths(`${month}-01`, 1)));
}

/**
 * Every source id that already has a live match in this month, with the total
 * matched against it. A source is "unmatched" only while that total is below
 * its own amount — which is what makes partial matching work (§7.10).
 */
async function matchedTotals(month: string) {
  const rows = await prisma.reconciliationMatch.findMany({
    where: { bankPostedDate: { gte: monthStart(month) }, reversedAt: null },
    select: { sourceType: true, sourceId: true, amount: true },
  });
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const key = `${row.sourceType}:${row.sourceId}`;
    totals.set(key, (totals.get(key) ?? 0n) + sumDecimals([row.amount]));
  }
  return totals;
}

function keyOf(sourceType: PoolItem["sourceType"], id: string): string {
  return `${sourceType}:${id}`;
}

/** Sub-centavo rounding guard for a difference, as pesos. */
function toPesos(centavos: bigint): number {
  return Number(centavos) / 100;
}

/**
 * Sum Prisma Decimal amounts exactly.
 *
 * `finance.ts` is imported by client components and must not depend on
 * Prisma, so widening Decimal -> number happens here at this boundary. The
 * string form is exact for a Decimal(10, 2), and `sum` re-widens to bigint, so
 * no float arithmetic happens on the value itself.
 */
function sumDecimals(values: Iterable<{ toString(): string }>): bigint {
  return sum(Array.from(values, (v) => v.toString()));
}

export async function getWorkspaceMonth(month: string): Promise<WorkspaceMonth> {
  await requireSiteAccess();
  await requireReconciliationEnabled();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM.");

  const gte = monthStart(month);
  const lt = nextMonthStart(month);
  const totals = await matchedTotals(month);

  // Both pools read the source record's own date, so a July receipt waits in
  // July even if it will ultimately be matched against an August statement.
  const [payments, settlements] = await Promise.all([
    prisma.bookingPayment.findMany({
      where: { status: "ACTIVE", receivedDate: { gte, lt } },
      orderBy: { receivedDate: "asc" },
      include: { booking: { select: { guestName: true, source: true } } },
    }),
    prisma.expenseSettlement.findMany({
      where: { status: "ACTIVE", paidDate: { gte, lt } },
      orderBy: { paidDate: "asc" },
      include: {
        expense: { select: { description: true, category: true } },
        refundForBooking: { select: { guestName: true } },
      },
    }),
  ]);

  const inflows: PoolItem[] = [];
  for (const p of payments) {
    const matched = totals.get(keyOf("booking_payment", p.id)) ?? 0n;
    const full = sumDecimals([p.amount]);
    if (matched >= full) continue; // fully matched — not outstanding
    inflows.push({
      key: keyOf("booking_payment", p.id),
      sourceType: "booking_payment",
      sourceId: p.id,
      amount: toPesos(full - matched),
      date: dateToISO(p.receivedDate),
      label: p.booking.guestName,
      detail: p.booking.source === "AIRBNB" ? "Airbnb" : "Direct",
      reference: p.reference,
      older: monthOf(dateToISO(p.receivedDate)) < month,
      kind: "receipt",
    });
  }

  const outflows: PoolItem[] = [];
  for (const s of settlements) {
    const matched = totals.get(keyOf("expense_settlement", s.id)) ?? 0n;
    const full = sumDecimals([s.amount]);
    if (matched >= full) continue;
    outflows.push({
      key: keyOf("expense_settlement", s.id),
      sourceType: "expense_settlement",
      sourceId: s.id,
      amount: toPesos(full - matched),
      date: dateToISO(s.paidDate),
      label: s.refundForBooking?.guestName ?? s.expense?.description ?? "Refund",
      detail: SETTLEMENT_DETAIL[s.settlementType],
      reference: s.reference,
      older: monthOf(dateToISO(s.paidDate)) < month,
      kind: s.settlementType === "GUEST_REFUND" ? "refund" : "payout",
    });
  }

  const historyRows = await prisma.reconciliationMatch.findMany({
    where: { bankPostedDate: { gte, lt }, reversedAt: null },
    orderBy: [{ bankPostedDate: "asc" }, { matchedAt: "asc" }],
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      amount: true,
      bankPostedDate: true,
      matchedBy: true,
      matchedAt: true,
      statementGroupKey: true,
    },
  });

  // Labels for history rows come from whichever table the match points at, so
  // a reversed-then-recreated record still reads sensibly in the ledger.
  const historyLabels = await labelsFor(historyRows);
  const history: MatchedItem[] = historyRows.map((m) => {
    const sourceType =
      m.sourceType === "BOOKING_PAYMENT" ? "booking_payment" : "expense_settlement";
    const meta = historyLabels.get(keyOf(sourceType, m.sourceId));
    return {
      key: m.id,
      sourceType,
      sourceId: m.sourceId,
      amount: toPesos(sumDecimals([m.amount])),
      bankPostedDate: dateToISO(m.bankPostedDate),
      label: meta?.label ?? "Deleted record",
      detail: meta?.detail ?? "",
      matchedBy: m.matchedBy,
      matchedAt: m.matchedAt.toISOString(),
      statementGroupKey: m.statementGroupKey,
    };
  });

  // Adjustments carry their own bank posting date, so they land in the month's
  // totals directly rather than needing a separate "match it" step (§4.7).
  const adjustments = await prisma.reconciliationAdjustment.findMany({
    where: { status: "ACTIVE", bankPostedDate: { gte, lt } },
    orderBy: [{ bankPostedDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      direction: true,
      amount: true,
      bankPostedDate: true,
      category: true,
      description: true,
      createdBy: true,
    },
  });
  const adjustmentIn = sumDecimals(
    adjustments.filter((a) => a.direction === "INFLOW").map((a) => a.amount),
  );
  const adjustmentOut = sumDecimals(
    adjustments.filter((a) => a.direction === "OUTFLOW").map((a) => a.amount),
  );

  for (const a of adjustments) {
    history.push({
      key: a.id,
      sourceType: "adjustment",
      sourceId: a.id,
      amount: toPesos(sumDecimals([a.amount])),
      bankPostedDate: dateToISO(a.bankPostedDate),
      label: a.description,
      detail: ADJUSTMENT_DETAIL[a.category] ?? "Adjustment",
      matchedBy: a.createdBy,
      matchedAt: a.bankPostedDate.toISOString(),
      statementGroupKey: null,
    });
  }
  history.sort((a, b) => a.bankPostedDate.localeCompare(b.bankPostedDate));

  const matchedInTotal = toPesos(
    sum(history.filter((h) => h.sourceType === "booking_payment").map((h) => h.amount)) +
      adjustmentIn,
  );
  const matchedOutTotal = toPesos(
    sum(history.filter((h) => h.sourceType === "expense_settlement").map((h) => h.amount)) +
      adjustmentOut,
  );

  return {
    month,
    inflows,
    outflows,
    history,
    matchedInTotal,
    matchedOutTotal,
    unmatchedInCount: inflows.length,
    unmatchedOutCount: outflows.length,
    unmatchedInTotal: toPesos(sum(inflows.map((i) => i.amount))),
    unmatchedOutTotal: toPesos(sum(outflows.map((o) => o.amount))),
    olderInCount: inflows.filter((i) => i.older).length,
    olderOutCount: outflows.filter((o) => o.older).length,
  };
}

const ADJUSTMENT_DETAIL: Record<string, string> = {
  BANK_FEE: "Bank fee",
  BANK_INTEREST: "Interest",
  CHARGEBACK: "Chargeback",
  OWNER_CONTRIBUTION: "Owner contribution",
  OWNER_WITHDRAWAL: "Owner withdrawal",
  TRANSFER_CORRECTION: "Transfer correction",
  DUPLICATE_CORRECTION: "Duplicate correction",
  OTHER: "Adjustment",
};

const SETTLEMENT_DETAIL: Record<string, string> = {
  DIRECT_VENDOR_PAYMENT: "Paid vendor",
  OWNER_REIMBURSEMENT: "Reimbursement",
  CLEANER_PAYMENT: "Cleaner",
  GUEST_REFUND: "Guest refund",
  OTHER: "Other",
};

/** Resolve display labels for a batch of match rows in two queries, not N. */
async function labelsFor(
  rows: { sourceType: string; sourceId: string }[],
): Promise<Map<string, { label: string; detail: string }>> {
  const out = new Map<string, { label: string; detail: string }>();
  const paymentIds = rows.filter((r) => r.sourceType === "BOOKING_PAYMENT").map((r) => r.sourceId);
  const settlementIds = rows.filter((r) => r.sourceType === "EXPENSE_SETTLEMENT").map((r) => r.sourceId);

  const [payments, settlements] = await Promise.all([
    paymentIds.length
      ? prisma.bookingPayment.findMany({
          where: { id: { in: paymentIds } },
          select: {
            id: true,
            method: true,
            booking: { select: { guestName: true, source: true } },
          },
        })
      : [],
    settlementIds.length
      ? prisma.expenseSettlement.findMany({
          where: { id: { in: settlementIds } },
          select: {
            id: true,
            settlementType: true,
            reimbursedTo: true,
            expense: { select: { description: true } },
            refundForBooking: { select: { guestName: true } },
          },
        })
      : [],
  ]);

  for (const p of payments) {
    out.set(keyOf("booking_payment", p.id), {
      label: p.booking.guestName,
      detail: p.booking.source === "AIRBNB" ? "Airbnb" : "Direct",
    });
  }
  for (const s of settlements) {
    out.set(keyOf("expense_settlement", s.id), {
      label: s.refundForBooking?.guestName ?? s.expense?.description ?? "Refund",
      detail: s.reimbursedTo
        ? `Reimbursed ${s.reimbursedTo}`
        : SETTLEMENT_DETAIL[s.settlementType] ?? "Other",
    });
  }
  return out;
}