import { remainingCentavos, type Direction, type SourceType } from "./reconciliation-match-rules";

/**
 * Building the outstanding pools (§4.8) as a pure function, so the rule about
 * what counts as outstanding is testable without a database.
 *
 * The rule that is easy to get wrong: **outstanding is a property of the source
 * record, not of the month its match was posted in.** A June receipt cleared by
 * an August deposit is settled — the money arrived, late. It must not reappear
 * in June's pool, or a month that was already reconciled looks unfinished every
 * time someone looks back at it. So the matched total for a source is summed
 * across *every* live match regardless of posting month, and the pool itself is
 * chosen by the record's own date.
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
  kind: "receipt" | "payout" | "refund";
};

/** A source record, reduced to what the pool needs. Amounts stay in centavos. */
export type PoolRecord = {
  id: string;
  sourceType: "booking_payment" | "expense_settlement";
  amountCentavos: bigint;
  /** `YYYY-MM-DD` — the record's own date, not when it was matched. */
  recordDate: string;
  label: string;
  detail: string;
  reference: string;
  bookingSource?: string | null;
  settlementType?: string | null;
};

/** Live matched totals keyed by `${sourceType}:${sourceId}`, in centavos. */
export type MatchedTotals = Map<string, bigint>;

export function poolKey(sourceType: PoolRecord["sourceType"], id: string): string {
  return `${sourceType}:${id}`;
}

/**
 * The outstanding balance of one source record, in centavos.
 *
 * Looks up the record's own key across *all* live matches — see the note at the
 * top of this file about why the posting month must not narrow this.
 */
export function outstandingFor(record: PoolRecord, matched: MatchedTotals): bigint {
  return remainingCentavos(
    record.amountCentavos,
    matched.get(poolKey(record.sourceType, record.id)) ?? 0n,
  );
}

/**
 * Turn records and their matched totals into the outstanding pool for a month.
 *
 * Records are supplied already narrowed to the month (plus any earlier carry-over
 * the caller chose to include), so this only decides what is left unpaid and
 * labels it for display.
 */
export function buildPool(
  records: PoolRecord[],
  matched: MatchedTotals,
  month: string,
): PoolItem[] {
  const items: PoolItem[] = [];
  for (const record of records) {
    const key = poolKey(record.sourceType, record.id);
    const remaining = outstandingFor(record, matched);
    // Fully matched — not outstanding, so it is not in the pool at all.
    if (remaining <= 0n) continue;
    items.push({
      key,
      sourceType: record.sourceType,
      sourceId: record.id,
      amount: Number(remaining) / 100,
      date: record.recordDate,
      label: record.label,
      detail: record.detail,
      reference: record.reference,
      older: record.recordDate.slice(0, 7) < month,
      kind:
        record.sourceType === "booking_payment"
          ? "receipt"
          : record.settlementType === "GUEST_REFUND"
            ? "refund"
            : "payout",
    });
  }
  return items;
}

/** Total outstanding value across a pool, in centavos. */
export function poolTotal(items: PoolItem[]): bigint {
  let total = 0n;
  for (const item of items) total += BigInt(Math.round(item.amount * 100));
  return total;
}

/** Direction of a pool row, derived from its source type — never stored twice. */
export function poolDirection(sourceType: PoolRecord["sourceType"]): Direction {
  return sourceType === "booking_payment" ? "INFLOW" : "OUTFLOW";
}

/** The match source type a pool row corresponds to. */
export function poolSourceType(sourceType: PoolRecord["sourceType"]): SourceType {
  return sourceType === "booking_payment" ? "BOOKING_PAYMENT" : "EXPENSE_SETTLEMENT";
}