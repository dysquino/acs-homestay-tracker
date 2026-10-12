/**
 * Kill switch for the reconciliation feature.
 *
 * The reconciliation workspace is the largest and least reversible thing this
 * app will ever do — once a month is finalized, its report is immutable and
 * reopening is a deliberate, audited act. That makes "turn it off for a minute
 * while we look at a bug" a routine need rather than an emergency.
 *
 * So the feature is gated in one place, by one env var, and checked in two
 * layers:
 *
 *   - the server actions, so nothing can be written even if a UI path is
 *     reached directly (they're plain POST endpoints — see access.ts);
 *   - the route and nav item, so a disabled feature simply isn't there.
 *
 * Default is ON once the env var is set, and OFF when it isn't — a typo'd
 * value must fail closed, not accidentally leave an audit feature reachable.
 * Set `RECONCILIATION_ENABLED=true` in the deployment environment to turn it on.
 */

/** True only for an explicit truthy value; anything else is off. */
function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Whether reconciliation may be used in this process. Read fresh on every
 * call rather than cached at module load, so toggling the env var and
 * redeploying takes effect without a stale value surviving in a warm server.
 */
export function isReconciliationEnabled(): boolean {
  return isEnabled(process.env.RECONCILIATION_ENABLED);
}

/**
 * Server-side gate for every reconciliation write.
 *
 * Distinct from `requireSiteAccess()`: that answers "is this one of the five
 * owners?", this answers "is this feature switched on right now?". A disabled
 * feature must refuse the write rather than silently accept it.
 */
export function requireReconciliationEnabled(): void {
  if (!isReconciliationEnabled()) {
    throw new Error("Reconciliation is currently disabled.");
  }
}

/** The value safe to hand to client components — a plain boolean, no secrets. */
export function reconciliationEnabledForClient(): boolean {
  return isReconciliationEnabled();
}