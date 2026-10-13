"use server";

import { isReconciliationEnabled } from "@/lib/reconciliation-flag";

import { requireSiteAccess } from "./access";

/**
 * Whether the reconciliation feature is switched on in this deployment.
 *
 * Read by the store on every load so the UI can hide the payments / settlements
 * panels entirely when the feature is off, rather than showing controls whose
 * server actions would reject the write (see requireReconciliationEnabled).
 * Cheap — it's an env read, no database.
 */
export async function getReconciliationStatus(): Promise<{ enabled: boolean }> {
  await requireSiteAccess();
  return { enabled: isReconciliationEnabled() };
}