import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  buildLedger,
  calculatePeriodTotals,
  canFinalize,
  type ReconciledItem,
} from "../reconciliation-period";
import { buildPool } from "../reconciliation-pool";

/**
 * Integration tests for the reconciliation audit machinery.
 *
 * These exist because the interesting guarantees are enforced by Postgres, not
 * by application code, and a unit test with a mocked client cannot see any of
 * them: the compare-and-set that stops a double finalization, the unique
 * constraint on snapshot versions, the foreign keys, and the trigger that
 * refuses writes to a sealed month. All of it was verified by hand during the
 * build and none of it was repeatable — this file is that verification, kept.
 *
 * They need a real database, so they skip cleanly when `DATABASE_URL` is absent
 * and a fresh clone isn't forced to have one. Run them with:
 *
 *     npx dotenv -e .env.local -- npx vitest run reconciliation-integration
 *
 * ## Safety
 *
 * Everything happens inside one far-future month (`2099-01`) that no real
 * reconciliation will ever reach, and `ReconciliationMatch` references its
 * source polymorphically with no foreign key — so these tests create **zero**
 * rows in bookings, expenses, cleaning or blocked-dates. Every row created is
 * recorded by id and deleted in `afterAll`, which runs even when a test fails.
 *
 * The month is also asserted empty before the suite starts. If a previous run
 * was interrupted and left rows behind, that is a real finding and the suite
 * refuses to proceed rather than compounding it.
 */

const HAS_DATABASE = Boolean(process.env.DATABASE_URL);
const TEST_MONTH = "2099-01-01T00:00:00.000Z";

const prisma = HAS_DATABASE ? new PrismaClient() : null;

function makeClient() {
  if (!prisma) throw new Error("No database client — this suite should have been skipped.");
  return prisma;
}

const created = {
  periods: [] as string[],
  snapshots: [] as string[],
  adjustments: [] as string[],
  matches: [] as string[],
  events: [] as string[],
};

async function cleanup() {
  const db = makeClient();
  // Children before parents: the period foreign keys RESTRICT.
  await db.reconciliationMatch.deleteMany({ where: { id: { in: created.matches } } });
  await db.reconciliationAdjustment.deleteMany({ where: { id: { in: created.adjustments } } });
  await db.reconciliationSnapshot.deleteMany({ where: { id: { in: created.snapshots } } });
  await db.reconciliationAuditEvent.deleteMany({ where: { id: { in: created.events } } });
  await db.reconciliationPeriod.deleteMany({ where: { id: { in: created.periods } } });
}

const matchData = (periodId: string, over: Record<string, unknown> = {}) => ({
  periodId,
  sourceType: "EXPENSE_SETTLEMENT" as const,
  sourceId: "integration-synthetic",
  direction: "OUTFLOW" as const,
  amount: 1000,
  bankPostedDate: new Date("2099-01-11T00:00:00.000Z"),
  statementGroupKey: "integration-group",
  matchedBy: "INTEGRATION",
  ...over,
});

const adjustmentData = (periodId: string, over: Record<string, unknown> = {}) => ({
  periodId,
  direction: "OUTFLOW" as const,
  category: "BANK_FEE" as const,
  status: "ACTIVE" as const,
  amount: 50,
  effectiveDate: new Date("2099-01-15T00:00:00.000Z"),
  bankPostedDate: new Date("2099-01-15T00:00:00.000Z"),
  description: "Integration bank fee",
  createdBy: "INTEGRATION",
  ...over,
});

async function refusal(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

describe.skipIf(!HAS_DATABASE)("reconciliation audit machinery (integration)", () => {
  beforeAll(async () => {
    const db = makeClient();
    // A leftover means an interrupted run. Surfacing it beats silently adding
    // to it — the count is the only thing these tests assume about the world.
    const stray = await db.reconciliationPeriod.count({
      where: { month: new Date(TEST_MONTH) },
    });
    if (stray > 0) {
      throw new Error(
        `Test month 2099-01 already has ${stray} period row(s). A previous run was interrupted — clean it up before re-running.`,
      );
    }
  });

  afterEach(async () => {
    // Keep each test independent so one failure can't cascade into the rest.
    await cleanup();
  });

  afterAll(async () => {
    if (prisma) {
      await cleanup();
      await prisma.$disconnect();
    }
  });

  it("refuses a match that points at a period that doesn't exist", async () => {
    const db = makeClient();
    expect(await refusal(() => db.reconciliationMatch.create({ data: matchData("no-such-period") }))).toBe(
      true,
    );
  });

  it("allows only one period per month", async () => {
    const db = makeClient();
    const first = await db.reconciliationPeriod.create({
      data: { month: new Date(TEST_MONTH), status: "DRAFT" },
    });
    created.periods.push(first.id);
    expect(
      await refusal(() =>
        db.reconciliationPeriod.create({ data: { month: new Date(TEST_MONTH), status: "DRAFT" } }),
      ),
    ).toBe(true);
  });

  it("refuses a second finalization of the same month", async () => {
    const db = makeClient();
    const period = await db.reconciliationPeriod.create({
      data: { month: new Date(TEST_MONTH), status: "DRAFT" },
    });
    created.periods.push(period.id);

    const claim = await db.reconciliationPeriod.updateMany({
      where: { id: period.id, status: { not: "FINALIZED" } },
      data: { status: "FINALIZED", finalizedAt: new Date(), finalizedBy: "INTEGRATION" },
    });
    expect(claim.count).toBe(1);

    const second = await db.reconciliationPeriod.updateMany({
      where: { id: period.id, status: { not: "FINALIZED" } },
      data: { status: "FINALIZED" },
    });
    expect(second.count).toBe(0);
  });

  it("files a snapshot under one version per period", async () => {
    const db = makeClient();
    const period = await db.reconciliationPeriod.create({
      data: { month: new Date(TEST_MONTH), status: "DRAFT" },
    });
    created.periods.push(period.id);

    const snap = await db.reconciliationSnapshot.create({
      data: {
        periodId: period.id,
        version: 1,
        summaryJson: {},
        ledgerJson: [],
        outstandingJson: [],
        finalizedBy: "INTEGRATION",
      },
    });
    created.snapshots.push(snap.id);

    expect(
      await refusal(() =>
        db.reconciliationSnapshot.create({
          data: {
            periodId: period.id,
            version: 1,
            summaryJson: {},
            ledgerJson: [],
            outstandingJson: [],
            finalizedBy: "INTEGRATION",
          },
        }),
      ),
    ).toBe(true);
  });

  it("refuses writes to a sealed month, and permits them again once reopened", async () => {
    const db = makeClient();
    const period = await db.reconciliationPeriod.create({
      data: { month: new Date(TEST_MONTH), status: "DRAFT" },
    });
    created.periods.push(period.id);

    const match = await db.reconciliationMatch.create({ data: matchData(period.id) });
    created.matches.push(match.id);
    const adjustment = await db.reconciliationAdjustment.create({
      data: adjustmentData(period.id),
    });
    created.adjustments.push(adjustment.id);

    await db.reconciliationPeriod.update({
      where: { id: period.id },
      data: { status: "FINALIZED", finalizedAt: new Date(), finalizedBy: "INTEGRATION" },
    });

    // INSERT and UPDATE both — reversing a match is an UPDATE, and §7.13
    // forbids unmatching inside a sealed month as firmly as matching into one.
    expect(
      await refusal(() =>
        db.reconciliationMatch.create({ data: matchData(period.id, { sourceId: "blocked" }) }),
      ),
    ).toBe(true);
    expect(
      await refusal(() =>
        db.reconciliationMatch.update({
          where: { id: match.id },
          data: { reversedAt: new Date(), reversedBy: "INTEGRATION" },
        }),
      ),
    ).toBe(true);
    expect(
      await refusal(() =>
        db.reconciliationAdjustment.create({ data: adjustmentData(period.id, { description: "blocked" }) }),
      ),
    ).toBe(true);

    await db.reconciliationPeriod.update({
      where: { id: period.id },
      data: {
        status: "REOPENED",
        reopenedAt: new Date(),
        reopenedBy: "INTEGRATION",
        reopenReason: "integration test",
        version: { increment: 1 },
        finalizedAt: null,
        finalizedBy: null,
        calculatedBalance: null,
        difference: null,
      },
    });

    const afterReopen = await db.reconciliationMatch.create({
      data: matchData(period.id, { sourceId: "after-reopen" }),
    });
    created.matches.push(afterReopen.id);
    const reversed = await db.reconciliationMatch.update({
      where: { id: match.id },
      data: { reversedAt: new Date(), reversedBy: "INTEGRATION" },
    });
    expect(reversed.reversedAt).not.toBeNull();

    // Re-sealing must re-engage the guard.
    await db.reconciliationPeriod.update({
      where: { id: period.id },
      data: { status: "FINALIZED", finalizedAt: new Date(), finalizedBy: "INTEGRATION" },
    });
    expect(
      await refusal(() =>
        db.reconciliationMatch.create({ data: matchData(period.id, { sourceId: "blocked-again" }) }),
      ),
    ).toBe(true);
  });

  it("preserves the prior snapshot across a reopen and a re-finalization", async () => {
    const db = makeClient();
    const period = await db.reconciliationPeriod.create({
      data: { month: new Date(TEST_MONTH), status: "DRAFT" },
    });
    created.periods.push(period.id);

    const first = await db.reconciliationSnapshot.create({
      data: {
        periodId: period.id,
        version: 1,
        summaryJson: { attempt: 1 },
        ledgerJson: [],
        outstandingJson: [],
        finalizedBy: "INTEGRATION",
      },
    });
    created.snapshots.push(first.id);

    await db.reconciliationPeriod.update({
      where: { id: period.id },
      data: { status: "REOPENED", reopenedAt: new Date(), reopenedBy: "INTEGRATION", version: { increment: 1 } },
    });

    const afterReopen = await db.reconciliationPeriod.findUnique({ where: { id: period.id } });
    expect(afterReopen?.version).toBe(2);

    const second = await db.reconciliationSnapshot.create({
      data: {
        periodId: period.id,
        version: afterReopen!.version,
        summaryJson: { attempt: 2 },
        ledgerJson: [],
        outstandingJson: [],
        finalizedBy: "INTEGRATION",
      },
    });
    created.snapshots.push(second.id);

    const all = await db.reconciliationSnapshot.findMany({
      where: { periodId: period.id },
      orderBy: { version: "asc" },
    });
    // §8.11: reopening must not destroy what was previously certified.
    expect(all.map((s) => s.version)).toEqual([1, 2]);
    expect((all[0]!.summaryJson as { attempt: number }).attempt).toBe(1);
  });

  it("refuses a draft edit based on a stale updatedAt", async () => {
    // §14 asks for a version check on draft updates; finalization's own guard
    // protects sealing but nothing protected editing.
    const db = makeClient();
    const period = await db.reconciliationPeriod.create({
      data: { month: new Date(TEST_MONTH), status: "DRAFT" },
    });
    created.periods.push(period.id);

    const firstRead = await db.reconciliationPeriod.findUniqueOrThrow({ where: { id: period.id } });

    // Someone else saves.
    await db.reconciliationPeriod.update({
      where: { id: period.id },
      data: { startingBalance: 999 },
    });

    const stale = await db.reconciliationPeriod.updateMany({
      where: { id: period.id, updatedAt: firstRead.updatedAt },
      data: { startingBalance: 500 },
    });
    expect(stale.count).toBe(0);

    // A fresh read still works.
    const secondRead = await db.reconciliationPeriod.findUniqueOrThrow({ where: { id: period.id } });
    const fresh = await db.reconciliationPeriod.updateMany({
      where: { id: period.id, updatedAt: secondRead.updatedAt },
      data: { startingBalance: 500 },
    });
    expect(fresh.count).toBe(1);
  });
});

/**
 * The arithmetic, checked against the same shapes the database hands back.
 *
 * This part needs no database and runs everywhere, so a fresh clone still gets
 * coverage of the exact-zero rule that gates finalization.
 */
describe("period arithmetic", () => {
  const item = (over: Partial<ReconciledItem> = {}): ReconciledItem => ({
    sourceType: "EXPENSE_SETTLEMENT",
    sourceId: "s1",
    direction: "OUTFLOW",
    amount: 1000,
    category: "OPERATING_EXPENSE",
    bankPostedDate: "2099-01-11",
    recordDate: "2099-01-10",
    label: "Vendor",
    detail: "Paid vendor",
    recordedBy: "INTEGRATION",
    reference: "m1",
    sequence: 1,
    statementGroupKey: "g1",
    ...over,
  });

  it("finalizes only at an exact zero, in either direction", () => {
    const items = [item()];
    expect(canFinalize(calculatePeriodTotals({ startingBalance: 5000, endingBalance: 4000, items }))).toBe(
      true,
    );
    expect(
      canFinalize(calculatePeriodTotals({ startingBalance: 5000, endingBalance: 4000.01, items })),
    ).toBe(false);
    expect(
      canFinalize(calculatePeriodTotals({ startingBalance: 5000, endingBalance: 3999.99, items })),
    ).toBe(false);
  });

  it("ends the ledger on the calculated balance", () => {
    const items = [item(), item({ amount: 50, category: "BANK_FEE", sourceType: "ADJUSTMENT", sequence: 2 })];
    const totals = calculatePeriodTotals({ startingBalance: 5000, endingBalance: 3950, items });
    const ledger = buildLedger(totals.startingBalanceCentavos, items);
    expect(ledger.at(-1)!.runningBalanceCentavos).toBe(395000n);
  });

  it("drops a fully matched record from the outstanding pool", () => {
    const pool = buildPool(
      [
        { id: "a", sourceType: "expense_settlement", amountCentavos: 100000n, recordDate: "2099-01-10", label: "", detail: "", reference: "" },
        { id: "b", sourceType: "expense_settlement", amountCentavos: 30000n, recordDate: "2099-01-12", label: "", detail: "", reference: "" },
      ],
      new Map([["expense_settlement:a", 100000n]]),
      "2099-01",
    );
    expect(pool.map((p) => p.sourceId)).toEqual(["b"]);
  });
});