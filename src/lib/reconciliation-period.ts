import { absolute, subtract, sum, toAmount, toCentavos } from "./finance";
import type { Direction, SourceType } from "./reconciliation-match-rules";

/**
 * The Monthly Audit arithmetic (§8.5, §8.6, §8.7).
 *
 * Everything the audit asserts about a month is computed here, in integer
 * centavos, with no database and no floats — so the rule that a month
 * reconciles only at an exact zero can be tested exhaustively before it is ever
 * pointed at production data. §8.9 requires the server to recalculate rather
 * than trust anything a client sends; this module is what it recalculates with.
 *
 * The shape of the answer is deliberately more than one number. A single
 * "difference" tells the owner whether the month ties out and nothing about
 * *why* it doesn't, and a breakdown that only appears once the difference is
 * zero has been useless at exactly the moment it was needed.
 */

/**
 * The display buckets §8.5 asks the Verify stage to break the month into.
 *
 * These are reporting categories, not money directions — the direction is
 * derived from the source type and never inferred from a bucket name, so a
 * category can never quietly move an amount to the other side of the balance.
 */
export type PeriodCategory =
  | "AIRBNB_RECEIPT"
  | "DIRECT_RECEIPT"
  | "OTHER_RECEIPT"
  | "POSITIVE_ADJUSTMENT"
  | "OPERATING_EXPENSE"
  | "CLEANING_PAYMENT"
  | "OWNER_REIMBURSEMENT"
  | "GUEST_REFUND"
  | "BANK_FEE"
  | "OTHER_NEGATIVE_ADJUSTMENT";

export const CATEGORY_LABELS: Record<PeriodCategory, string> = {
  AIRBNB_RECEIPT: "Airbnb receipts",
  DIRECT_RECEIPT: "Direct-booking receipts",
  OTHER_RECEIPT: "Other booking receipts",
  POSITIVE_ADJUSTMENT: "Positive adjustments",
  OPERATING_EXPENSE: "Operating expenses",
  CLEANING_PAYMENT: "Cleaning payments",
  OWNER_REIMBURSEMENT: "Owner reimbursements",
  GUEST_REFUND: "Guest refunds",
  BANK_FEE: "Bank fees",
  OTHER_NEGATIVE_ADJUSTMENT: "Other negative adjustments",
};

/** Receipt categories, in the order the Verify stage lists them. */
export const INFLOW_CATEGORIES: PeriodCategory[] = [
  "AIRBNB_RECEIPT",
  "DIRECT_RECEIPT",
  "OTHER_RECEIPT",
  "POSITIVE_ADJUSTMENT",
];

/** Outflow categories, in the order the Verify stage lists them. */
export const OUTFLOW_CATEGORIES: PeriodCategory[] = [
  "OPERATING_EXPENSE",
  "CLEANING_PAYMENT",
  "OWNER_REIMBURSEMENT",
  "GUEST_REFUND",
  "BANK_FEE",
  "OTHER_NEGATIVE_ADJUSTMENT",
];

export type CategoryInput = {
  sourceType: SourceType | "ADJUSTMENT";
  direction: Direction;
  bookingSource?: string | null;
  settlementType?: string | null;
  adjustmentCategory?: string | null;
};

/**
 * Which reporting bucket a reconciled item belongs to.
 *
 * The cases that carry a judgement:
 *
 * - A booking payment from a source the app doesn't know about becomes
 *   `OTHER_RECEIPT` rather than being dropped. Legacy rows predate the current
 *   enum, and a receipt that vanishes from the breakdown would make the totals
 *   disagree with the ledger in a way that looks like a bug in the arithmetic.
 *
 * - A guest refund is its own bucket even though it is an expense settlement.
 *   §4.2 models it as money returned to a guest rather than a negative receipt,
 *   and lumping it in with vendor payments hides the one outflow a guest will
 *   ever ask about.
 *
 * - An adjustment's category decides only its *outflow* sub-bucket; bank fees
 *   are separated because they are the adjustment a bank adds on its own and
 *   the one most likely to be a duplicate if it also gets recorded as an
 *   expense.
 */
export function categoryFor(input: CategoryInput): PeriodCategory {
  if (input.sourceType === "ADJUSTMENT") {
    if (input.direction === "INFLOW") return "POSITIVE_ADJUSTMENT";
    return input.adjustmentCategory === "BANK_FEE" ? "BANK_FEE" : "OTHER_NEGATIVE_ADJUSTMENT";
  }
  if (input.sourceType === "BOOKING_PAYMENT") {
    if (input.bookingSource === "AIRBNB") return "AIRBNB_RECEIPT";
    if (input.bookingSource === "DIRECT") return "DIRECT_RECEIPT";
    return "OTHER_RECEIPT";
  }
  switch (input.settlementType) {
    case "GUEST_REFUND":
      return "GUEST_REFUND";
    case "CLEANER_PAYMENT":
      return "CLEANING_PAYMENT";
    case "OWNER_REIMBURSEMENT":
      return "OWNER_REIMBURSEMENT";
    default:
      return "OPERATING_EXPENSE";
  }
}

/** One reconciled movement, as the audit sees it. All amounts in pesos. */
export type ReconciledItem = {
  sourceType: SourceType | "ADJUSTMENT";
  sourceId: string;
  direction: Direction;
  amount: number;
  category: PeriodCategory;
  /** When it posted to the bank — the ordering key for the ledger. */
  bankPostedDate: string;
  /** The source record's own date, shown alongside for context. */
  recordDate: string;
  label: string;
  detail: string;
  /** Whoever recorded it, for the ledger's attribution column. */
  recordedBy: string;
  /** Match id, adjustment id, or audit reference (§8.7). */
  reference: string;
  /** Stable creation sequence, for ordering entries on the same date. */
  sequence: number;
  /** Set when several items share one statement line. */
  statementGroupKey: string | null;
};

export type OutstandingItem = {
  sourceType: SourceType;
  sourceId: string;
  direction: Direction;
  amount: number;
  label: string;
  detail: string;
  recordDate: string;
};

export type PeriodTotals = {
  /** Centavos per category. The breakdown is the point, so it is not collapsed. */
  byCategory: Record<PeriodCategory, bigint>;
  totalInflowCentavos: bigint;
  totalOutflowCentavos: bigint;
  netCentavos: bigint;
  startingBalanceCentavos: bigint;
  endingBalanceCentavos: bigint;
  calculatedBalanceCentavos: bigint;
  differenceCentavos: bigint;
  /** Whether the month ties out at an exact zero (§8.6). */
  reconciled: boolean;
  matchedCount: number;
  outstandingCount: number;
  outstandingValueCentavos: bigint;
};

/** §8.5, exactly. */
export function calculatePeriodTotals(input: {
  startingBalance: number;
  endingBalance: number;
  items: ReconciledItem[];
  outstanding?: OutstandingItem[];
}): PeriodTotals {
  const byCategory = emptyCategories();

  for (const item of input.items) {
    const cents = toCentavos(item.amount);
    byCategory[item.category] += cents;
  }

  const totalInflowCentavos = sum(INFLOW_CATEGORIES.map((c) => byCategory[c]));
  const totalOutflowCentavos = sum(OUTFLOW_CATEGORIES.map((c) => byCategory[c]));

  const startingBalanceCentavos = toCentavos(input.startingBalance);
  const endingBalanceCentavos = toCentavos(input.endingBalance);
  const calculatedBalanceCentavos =
    startingBalanceCentavos + totalInflowCentavos - totalOutflowCentavos;
  const differenceCentavos = subtract(calculatedBalanceCentavos, endingBalanceCentavos);

  const outstanding = input.outstanding ?? [];

  return {
    byCategory,
    totalInflowCentavos,
    totalOutflowCentavos,
    netCentavos: totalInflowCentavos - totalOutflowCentavos,
    startingBalanceCentavos,
    endingBalanceCentavos,
    calculatedBalanceCentavos,
    differenceCentavos,
    reconciled: differenceCentavos === 0n,
    matchedCount: input.items.length,
    outstandingCount: outstanding.length,
    // Magnitude, not net: an outstanding receipt and an outstanding payout are
    // both money the bank hasn't confirmed yet, and §8.8 counts them together
    // as work outstanding rather than as a balance.
    outstandingValueCentavos: sum(
      outstanding.map((o) => absolute(toCentavos(o.amount))),
    ),
  };
}

function emptyCategories(): Record<PeriodCategory, bigint> {
  return {
    AIRBNB_RECEIPT: 0n,
    DIRECT_RECEIPT: 0n,
    OTHER_RECEIPT: 0n,
    POSITIVE_ADJUSTMENT: 0n,
    OPERATING_EXPENSE: 0n,
    CLEANING_PAYMENT: 0n,
    OWNER_REIMBURSEMENT: 0n,
    GUEST_REFUND: 0n,
    BANK_FEE: 0n,
    OTHER_NEGATIVE_ADJUSTMENT: 0n,
  };
}

/** Pesos from centavos, for a display or persistence boundary. */
export function centavosToPesos(centavos: bigint): number {
  return toAmount(centavos);
}

export type LedgerRow = {
  /** "OPENING" for the starting balance, then one per reconciled item. */
  kind: "OPENING" | "MOVEMENT";
  bankPostedDate: string | null;
  recordDate: string | null;
  category: PeriodCategory | null;
  label: string;
  detail: string;
  inflowCentavos: bigint;
  outflowCentavos: bigint;
  runningBalanceCentavos: bigint;
  recordedBy: string;
  reference: string;
  statementGroupKey: string | null;
};

/**
 * The virtual ledger (§8.7): the month's movements in bank order with a
 * running balance, so the owner can see *where* the balance went rather than
 * only that it doesn't tie out.
 *
 * Opening balance first, then by posting date, then by the stable creation
 * sequence — the last of which is what keeps two movements on the same day in a
 * fixed order instead of whatever order the database happened to return them.
 */
export function buildLedger(
  startingBalanceCentavos: bigint,
  items: ReconciledItem[],
): LedgerRow[] {
  const ordered = [...items].sort(
    (a, b) =>
      a.bankPostedDate.localeCompare(b.bankPostedDate) || a.sequence - b.sequence,
  );

  const rows: LedgerRow[] = [
    {
      kind: "OPENING",
      bankPostedDate: null,
      recordDate: null,
      category: null,
      label: "Opening balance",
      detail: "Statement starting balance",
      inflowCentavos: 0n,
      outflowCentavos: 0n,
      runningBalanceCentavos: startingBalanceCentavos,
      recordedBy: "",
      reference: "",
      statementGroupKey: null,
    },
  ];

  let running = startingBalanceCentavos;
  for (const item of ordered) {
    const cents = toCentavos(item.amount);
    // Direction comes from the item, not the sign of the amount: amounts are
    // stored positive so a sign flip can't quietly invert a total.
    const inflow = item.direction === "INFLOW" ? cents : 0n;
    const outflow = item.direction === "OUTFLOW" ? cents : 0n;
    running += inflow - outflow;
    rows.push({
      kind: "MOVEMENT",
      bankPostedDate: item.bankPostedDate,
      recordDate: item.recordDate,
      category: item.category,
      label: item.label,
      detail: item.detail,
      inflowCentavos: inflow,
      outflowCentavos: outflow,
      runningBalanceCentavos: running,
      recordedBy: item.recordedBy,
      reference: item.reference,
      statementGroupKey: item.statementGroupKey,
    });
  }
  return rows;
}

/**
 * Whether a month may be sealed (§8.6).
 *
 * Exact zero, no tolerance knob. §8.6 permits introducing one later but
 * requires it to be a named configuration value applied consistently to both the
 * display and the validation — a threshold that exists only in the check would
 * let the screen show one number and finalize on another, which is the specific
 * failure the section forbids.
 */
export function canFinalize(totals: Pick<PeriodTotals, "differenceCentavos">): boolean {
  return totals.differenceCentavos === 0n;
}

/** Why a month can't be sealed yet, phrased for the owner. */
export function finalizationBlocker(totals: Pick<PeriodTotals, "differenceCentavos">): string | null {
  if (canFinalize(totals)) return null;
  return (
    `The balance is out by ${formatSignedPesos(totals.differenceCentavos)}. ` +
    "Match or adjust the remaining movements until it reads ₱0.00."
  );
}

function formatSignedPesos(centavos: bigint): string {
  const sign = centavos < 0n ? "−" : "";
  return `${sign}₱${toAmount(absolute(centavos)).toFixed(2)}`;
}