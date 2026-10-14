"use server";

import { prisma } from "@/lib/prisma";
import { isReconciliationEnabled } from "@/lib/reconciliation-flag";

import { requireSiteAccess } from "./access";

/**
 * Whether the reconciliation feature is switched on right now.
 *
 * Read by the store on every load so the UI can hide the payments / settlements
 * panels entirely when the feature is off, rather than showing controls whose
 * server actions would reject the write.
 *
 * Resolves the stored toggle through `isReconciliationEnabled`, so the
 * RECONCILIATION_ENABLED env override applies here too — an operator who has
 * forced the feature off gets the panels hidden regardless of the database row.
 */
export async function getReconciliationStatus(): Promise<{ enabled: boolean }> {
  await requireSiteAccess();
  const row = await prisma.paymentConfig.findUnique({
    where: { id: "singleton" },
    select: { reconciliationEnabled: true },
  });
  return { enabled: isReconciliationEnabled(row?.reconciliationEnabled) };
}

/**
 * Server-side gate for every reconciliation write.
 *
 * Distinct from `requireSiteAccess()`: that answers "is this one of the five
 * owners?", this answers "is this feature switched on right now?". A disabled
 * feature must refuse the write rather than silently accept it.
 *
 * Lives here rather than in `reconciliation-flag.ts` because that module is
 * imported by client components and must not reach for the database.
 */
export async function requireReconciliationEnabled(): Promise<void> {
  const row = await prisma.paymentConfig.findUnique({
    where: { id: "singleton" },
    select: { reconciliationEnabled: true },
  });
  if (!isReconciliationEnabled(row?.reconciliationEnabled)) {
    throw new Error("Reconciliation is currently disabled.");
  }
}