import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  createExpenseSettlement,
  updateExpenseSettlement,
  voidExpenseSettlement,
} from "../data/expense-settlements";
import { updateExpense } from "../data/expenses";

/**
 * Integration tests for the refund status that follows a payout.
 *
 * The unit tests in `expense-refund.test.ts` cover the decision itself. These
 * cover the part a unit test cannot see: that the real server actions — the
 * ones the buttons in the app call — actually move the row in Postgres, and
 * that they do it inside the settlement's own transaction.
 *
 * They need a real database, so they skip cleanly when `DATABASE_URL` is absent
 * and a fresh clone isn't forced to have one. Run them with:
 *
 *     npx dotenv -e .env.local -- npx vitest run expense-refund-integration
 *
 * ## Safety
 *
 * Every row these tests create carries the same marker description and is
 * deleted in `afterEach` and `afterAll`, both of which run even when a test
 * fails. Nothing else is touched: no booking, no cleaning, no real expense.
 * The marker is asserted to be absent before the suite starts, so an
 * interrupted run is surfaced rather than compounded.
 */

// The site gate and the reconciliation toggle are about who may write, not
// about what a write does — and the access check needs a request scope and a
// cookie, neither of which exists here.
vi.mock("../data/access", () => ({ requireSiteAccess: async () => {} }));
vi.mock("../data/reconciliation-status", () => ({ requireReconciliationEnabled: async () => {} }));

const HAS_DATABASE = Boolean(process.env.DATABASE_URL);
const prisma = HAS_DATABASE ? new PrismaClient() : null;

const MARKER = "ZZ-INTEGRATION refund status probe";
const FUTURE_DATE = new Date("2099-01-05T00:00:00.000Z");

function makeClient() {
  if (!prisma) throw new Error("No database client — this suite should have been skipped.");
  return prisma;
}

type ExpenseOverrides = {
  amount?: number;
  paidBy?: string;
  refundStatus?: "REFUNDED" | "OWED";
};

async function createExpense(over: ExpenseOverrides = {}) {
  const db = makeClient();
  return db.expense.create({
    data: {
      date: FUTURE_DATE,
      category: "SUPPLIES",
      description: MARKER,
      amount: over.amount ?? 1000,
      paidBy: over.paidBy ?? "DK",
      receiptUrl: "",
      createdBy: "INTEGRATION",
      refundStatus: over.refundStatus ?? "OWED",
    },
  });
}

async function refundStatusOf(id: string) {
  const row = await makeClient().expense.findUniqueOrThrow({
    where: { id },
    select: { refundStatus: true },
  });
  return row.refundStatus;
}

/** Deleting the expense cascades to its settlements (§4.5's one-to-many). */
async function cleanup() {
  await makeClient().expense.deleteMany({ where: { description: MARKER } });
}

function settlementInput(amount: number) {
  return {
    amount,
    paidDate: "2099-01-06",
    settlementType: "owner_reimbursement" as const,
    reimbursedTo: "DK",
    reference: "",
    notes: "",
    createdBy: "INTEGRATION",
  };
}

describe.skipIf(!HAS_DATABASE)("expense refund status follows the payout (integration)", () => {
  beforeAll(async () => {
    const stray = await makeClient().expense.count({ where: { description: MARKER } });
    if (stray > 0) {
      throw new Error(
        `${stray} integration row(s) left over from an interrupted run — clean them up before re-running.`,
      );
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    if (prisma) {
      await cleanup();
      await prisma.$disconnect();
    }
  });

  it("marks an expense refunded once a payout covers it in full", async () => {
    const expense = await createExpense();
    await createExpenseSettlement({ expenseId: expense.id, ...settlementInput(1000) });
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
  });

  it("leaves it owed on a part payment", async () => {
    const expense = await createExpense();
    await createExpenseSettlement({ expenseId: expense.id, ...settlementInput(400) });
    expect(await refundStatusOf(expense.id)).toBe("OWED");
  });

  it("leaves it owed until the last installment lands", async () => {
    const expense = await createExpense();
    await createExpenseSettlement({ expenseId: expense.id, ...settlementInput(600) });
    expect(await refundStatusOf(expense.id)).toBe("OWED");
    await createExpenseSettlement({ expenseId: expense.id, ...settlementInput(400) });
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
  });

  it("marks it refunded when the expense save records the payout", async () => {
    // The path the expense form takes: the payout rides along with the save.
    const expense = await createExpense();
    await updateExpense(
      expense.id,
      { refundStatus: "owed" },
      {
        paidDate: "2099-01-06",
        settlementType: "owner_reimbursement",
        reimbursedTo: "DK",
      },
      "INTEGRATION",
    );
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
  });

  it("puts the claim back when the payout is voided", async () => {
    const expense = await createExpense();
    const settlement = await createExpenseSettlement({
      expenseId: expense.id,
      ...settlementInput(1000),
    });
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
    await voidExpenseSettlement(settlement.id, "INTEGRATION");
    expect(await refundStatusOf(expense.id)).toBe("OWED");
  });

  it("puts the claim back when the payout is edited down", async () => {
    const expense = await createExpense();
    const settlement = await createExpenseSettlement({
      expenseId: expense.id,
      ...settlementInput(1000),
    });
    await updateExpenseSettlement(settlement.id, { amount: 400 });
    expect(await refundStatusOf(expense.id)).toBe("OWED");
  });

  it("never leaves a bank-paid expense owed", async () => {
    // The validator rejects "owed" on a bank-paid expense, so a reversal must
    // not write one — it would make the row impossible to edit afterwards.
    const expense = await createExpense({ paidBy: "Bank", refundStatus: "REFUNDED" });
    const settlement = await createExpenseSettlement({
      expenseId: expense.id,
      ...settlementInput(1000),
    });
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
    await voidExpenseSettlement(settlement.id, "INTEGRATION");
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
  });

  it("leaves an already-refunded expense alone when a bigger bill appears", async () => {
    // A corrected amount is a missing payout date, not a reversed reimbursement.
    const expense = await createExpense({ refundStatus: "REFUNDED" });
    await createExpenseSettlement({ expenseId: expense.id, ...settlementInput(1000) });
    await updateExpense(expense.id, { amount: 1500 }, undefined, "INTEGRATION");
    expect(await refundStatusOf(expense.id)).toBe("REFUNDED");
  });
});
