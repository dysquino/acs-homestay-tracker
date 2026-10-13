import { describe, expect, it } from "vitest";

import { formatExactCentavos } from "../finance";
import {
  buildLedger,
  calculatePeriodTotals,
  canFinalize,
  CATEGORY_LABELS,
  categoryFor,
  finalizationBlocker,
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  type PeriodCategory,
  type ReconciledItem,
} from "../reconciliation-period";

let seq = 0;
const item = (over: Partial<ReconciledItem> = {}): ReconciledItem => ({
  sourceType: "BOOKING_PAYMENT",
  sourceId: `s${++seq}`,
  direction: "INFLOW",
  amount: 1000,
  category: "AIRBNB_RECEIPT",
  bankPostedDate: "2026-08-05",
  recordDate: "2026-08-04",
  label: "Guest",
  detail: "Airbnb",
  recordedBy: "Dys",
  reference: "ref",
  sequence: seq,
  statementGroupKey: null,
  ...over,
});

describe("categoryFor", () => {
  it("splits receipts by booking source", () => {
    expect(
      categoryFor({ sourceType: "BOOKING_PAYMENT", direction: "INFLOW", bookingSource: "AIRBNB" }),
    ).toBe("AIRBNB_RECEIPT");
    expect(
      categoryFor({ sourceType: "BOOKING_PAYMENT", direction: "INFLOW", bookingSource: "DIRECT" }),
    ).toBe("DIRECT_RECEIPT");
  });

  it("keeps a receipt from an unknown source rather than dropping it", () => {
    // Legacy rows predate the current enum. A receipt that vanished from the
    // breakdown would make the totals disagree with the ledger in a way that
    // looks like an arithmetic bug.
    expect(
      categoryFor({ sourceType: "BOOKING_PAYMENT", direction: "INFLOW", bookingSource: null }),
    ).toBe("OTHER_RECEIPT");
    expect(
      categoryFor({ sourceType: "BOOKING_PAYMENT", direction: "INFLOW", bookingSource: "BANK" }),
    ).toBe("OTHER_RECEIPT");
  });

  it("gives a guest refund its own bucket", () => {
    // §4.2 — money returned to a guest, not a negative receipt. It is the one
    // outflow a guest will ever ask about, so it must not hide among vendors.
    expect(
      categoryFor({
        sourceType: "EXPENSE_SETTLEMENT",
        direction: "OUTFLOW",
        settlementType: "GUEST_REFUND",
      }),
    ).toBe("GUEST_REFUND");
  });

  it("separates cleaning and owner reimbursements from ordinary expenses", () => {
    const of = (settlementType: string) =>
      categoryFor({ sourceType: "EXPENSE_SETTLEMENT", direction: "OUTFLOW", settlementType });
    expect(of("CLEANER_PAYMENT")).toBe("CLEANING_PAYMENT");
    expect(of("OWNER_REIMBURSEMENT")).toBe("OWNER_REIMBURSEMENT");
    expect(of("DIRECT_VENDOR_PAYMENT")).toBe("OPERATING_EXPENSE");
    expect(of("OTHER")).toBe("OPERATING_EXPENSE");
  });

  it("treats an unknown settlement type as an operating expense, not a refund", () => {
    // The safe direction: an unrecognised payout is money out to somebody, and
    // defaulting it to a refund would understate real vendor spending.
    expect(
      categoryFor({ sourceType: "EXPENSE_SETTLEMENT", direction: "OUTFLOW", settlementType: "????" }),
    ).toBe("OPERATING_EXPENSE");
    expect(
      categoryFor({ sourceType: "EXPENSE_SETTLEMENT", direction: "OUTFLOW", settlementType: null }),
    ).toBe("OPERATING_EXPENSE");
  });

  it("splits adjustments by direction, with bank fees apart", () => {
    expect(
      categoryFor({ sourceType: "ADJUSTMENT", direction: "INFLOW", adjustmentCategory: "BANK_FEE" }),
    ).toBe("POSITIVE_ADJUSTMENT");
    expect(
      categoryFor({ sourceType: "ADJUSTMENT", direction: "OUTFLOW", adjustmentCategory: "BANK_FEE" }),
    ).toBe("BANK_FEE");
    expect(
      categoryFor({ sourceType: "ADJUSTMENT", direction: "OUTFLOW", adjustmentCategory: "CHARGEBACK" }),
    ).toBe("OTHER_NEGATIVE_ADJUSTMENT");
  });

  it("labels every category the Verify stage can display", () => {
    for (const c of [...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES]) {
      expect(CATEGORY_LABELS[c as PeriodCategory], c).toBeTruthy();
    }
  });
});

describe("calculatePeriodTotals", () => {
  it("computes the §8.5 formula exactly", () => {
    // 10,000 opening + 5,000 receipts - 2,500 payouts = 12,500.
    const totals = calculatePeriodTotals({
      startingBalance: 10000,
      endingBalance: 12500,
      items: [
        item({ amount: 3000, category: "AIRBNB_RECEIPT" }),
        item({ amount: 2000, category: "DIRECT_RECEIPT" }),
        item({
          amount: 2500,
          direction: "OUTFLOW",
          category: "OPERATING_EXPENSE",
          sourceType: "EXPENSE_SETTLEMENT",
        }),
      ],
    });
    expect(totals.totalInflowCentavos).toBe(500000n);
    expect(totals.totalOutflowCentavos).toBe(250000n);
    expect(totals.calculatedBalanceCentavos).toBe(1250000n);
    expect(totals.differenceCentavos).toBe(0n);
    expect(totals.reconciled).toBe(true);
  });

  it("reports a positive difference when the statement ends higher", () => {
    const totals = calculatePeriodTotals({
      startingBalance: 1000,
      endingBalance: 2000,
      items: [],
    });
    expect(totals.differenceCentavos).toBe(-100000n);
    expect(totals.reconciled).toBe(false);
  });

  it("reports a negative difference when the statement ends lower", () => {
    const totals = calculatePeriodTotals({
      startingBalance: 2000,
      endingBalance: 1000,
      items: [],
    });
    expect(totals.differenceCentavos).toBe(100000n);
    expect(totals.reconciled).toBe(false);
  });

  it("keeps the category breakdown adding up to the two totals", () => {
    const totals = calculatePeriodTotals({
      startingBalance: 0,
      endingBalance: 0,
      items: [
        item({ amount: 1000, category: "AIRBNB_RECEIPT" }),
        item({ amount: 500.5, category: "DIRECT_RECEIPT" }),
        item({ amount: 200, category: "POSITIVE_ADJUSTMENT", sourceType: "ADJUSTMENT" }),
        item({
          amount: 700.25,
          direction: "OUTFLOW",
          category: "CLEANING_PAYMENT",
          sourceType: "EXPENSE_SETTLEMENT",
        }),
        item({
          amount: 50,
          direction: "OUTFLOW",
          category: "BANK_FEE",
          sourceType: "ADJUSTMENT",
        }),
      ],
    });
    const all = [...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES];
    expect(all.reduce((n, c) => n + totals.byCategory[c], 0n)).toBe(
      totals.totalInflowCentavos + totals.totalOutflowCentavos,
    );
  });

  it("tolerates a negative opening balance", () => {
    // §8.3 allows a negative balance where valid — an overdraft month is real.
    const totals = calculatePeriodTotals({
      startingBalance: -500,
      endingBalance: -200,
      items: [item({ amount: 300, category: "AIRBNB_RECEIPT" })],
    });
    expect(totals.calculatedBalanceCentavos).toBe(-20000n);
    expect(totals.differenceCentavos).toBe(0n);
  });

  it("sums outstanding value by magnitude, ignoring direction", () => {
    const totals = calculatePeriodTotals({
      startingBalance: 0,
      endingBalance: 0,
      items: [],
      outstanding: [
        { sourceType: "BOOKING_PAYMENT", sourceId: "a", direction: "INFLOW", amount: 1000, label: "", detail: "", recordDate: "" },
        { sourceType: "EXPENSE_SETTLEMENT", sourceId: "b", direction: "OUTFLOW", amount: 250.5, label: "", detail: "", recordDate: "" },
      ],
    });
    expect(totals.outstandingCount).toBe(2);
    expect(totals.outstandingValueCentavos).toBe(125050n);
  });

  it("is all zeroes for an empty month", () => {
    const totals = calculatePeriodTotals({ startingBalance: 0, endingBalance: 0, items: [] });
    expect(totals.matchedCount).toBe(0);
    expect(totals.totalInflowCentavos).toBe(0n);
    expect(totals.totalOutflowCentavos).toBe(0n);
    expect(totals.differenceCentavos).toBe(0n);
    expect(totals.reconciled).toBe(true);
  });
});

describe("canFinalize", () => {
  it("accepts an exact zero", () => {
    expect(canFinalize({ differenceCentavos: 0n })).toBe(true);
  });

  it("refuses one centavo off, in either direction", () => {
    // §8.6 wants an exact zero, and §8.7's centavo drift is exactly why: a
    // float-based total lands here and finalizes a month that doesn't tie out.
    expect(canFinalize({ differenceCentavos: 1n })).toBe(false);
    expect(canFinalize({ differenceCentavos: -1n })).toBe(false);
  });

  it("explains the difference without claiming it is close enough", () => {
    expect(finalizationBlocker({ differenceCentavos: 150n })).toMatch(/₱1\.50/);
    expect(finalizationBlocker({ differenceCentavos: -150n })).toMatch(/₱1\.50/);
    expect(finalizationBlocker({ differenceCentavos: 0n })).toBeNull();
  });
});

describe("buildLedger", () => {
  it("opens with the starting balance and no movement", () => {
    const rows = buildLedger(500000n, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("OPENING");
    expect(rows[0].runningBalanceCentavos).toBe(500000n);
    expect(rows[0].inflowCentavos).toBe(0n);
    expect(rows[0].outflowCentavos).toBe(0n);
  });

  it("ends at the calculated balance, so the ledger proves the total", () => {
    const items = [
      item({ amount: 1000, bankPostedDate: "2026-08-02", sequence: 1 }),
      item({
        amount: 400,
        direction: "OUTFLOW",
        category: "OPERATING_EXPENSE",
        sourceType: "EXPENSE_SETTLEMENT",
        bankPostedDate: "2026-08-03",
        sequence: 2,
      }),
    ];
    // buildLedger takes centavos: ₱500 opening, + ₱1000 in, − ₱400 out.
    const rows = buildLedger(50000n, items);
    expect(rows.map((r) => r.runningBalanceCentavos)).toEqual([50000n, 150000n, 110000n]);
  });

  it("orders by posting date, then by the stable sequence", () => {
    // §8.7. The same-day pair is the case that matters: without a stable
    // sequence the order would be whatever the database returned.
    const rows = buildLedger(0n, [
      item({ bankPostedDate: "2026-08-10", sequence: 2, label: "second" }),
      item({ bankPostedDate: "2026-08-02", sequence: 3, label: "earlier date" }),
      item({ bankPostedDate: "2026-08-10", sequence: 1, label: "first" }),
    ]);
    expect(rows.slice(1).map((r) => r.label)).toEqual([
      "earlier date",
      "first",
      "second",
    ]);
  });

  it("does not depend on the order the caller supplied", () => {
    const a = item({ bankPostedDate: "2026-08-02", sequence: 1, label: "a" });
    const b = item({ bankPostedDate: "2026-08-02", sequence: 2, label: "b" });
    expect(buildLedger(0n, [a, b]).map((r) => r.label)).toEqual(
      buildLedger(0n, [b, a]).map((r) => r.label),
    );
  });

  it("puts the amount on the side the direction says, not the sign", () => {
    // Amounts are stored positive; a sign flip must not invert the ledger.
    const rows = buildLedger(0n, [
      item({ amount: 250, direction: "OUTFLOW", category: "GUEST_REFUND", sourceType: "EXPENSE_SETTLEMENT" }),
    ]);
    expect(rows[1].inflowCentavos).toBe(0n);
    expect(rows[1].outflowCentavos).toBe(25000n);
    expect(rows[1].runningBalanceCentavos).toBe(-25000n);
  });

  it("keeps the statement group on the row so one bank line stays identifiable", () => {
    const rows = buildLedger(0n, [
      item({ amount: 100, statementGroupKey: "grp" }),
      item({ amount: 200, statementGroupKey: "grp" }),
    ]);
    expect(rows.slice(1).every((r) => r.statementGroupKey === "grp")).toBe(true);
  });

  it("renders centavo balances without float drift", () => {
    const rows = buildLedger(0n, [item({ amount: 0.1 }), item({ amount: 0.2 })]);
    // One opening row plus two movements.
    expect(rows[2].runningBalanceCentavos).toBe(30n);
    expect(formatExactCentavos(rows[2].runningBalanceCentavos)).toBe("0.30");
  });
});