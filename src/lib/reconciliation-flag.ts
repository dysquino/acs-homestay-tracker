/**
 * Kill switch for the reconciliation feature.
 *
 * The reconciliation workspace is the largest and least reversible thing this
 * app will ever do — once a month is finalized, its report is immutable and
 * reopening is a deliberate, audited act. That makes "turn it off for a minute
 * while we look at a bug" a routine need rather than an emergency.
 *
 * Two layers, deliberately:
 *
 *   1. `PaymentConfig.reconciliationEnabled` — the owner-toggleable switch on
 *      the Payment Settings page. This is the everyday control.
 *   2. `RECONCILIATION_ENABLED` in the environment — an operator-level
 *      override. When set to anything but "true" it forces the feature OFF for
 *      the whole deployment, regardless of the database.
 *
 * Why both: the database toggle is what you'd actually reach for, but a
 * feature this consequential should have a control that doesn't depend on the
 * database being reachable or correct. Setting the env var to "false" is the
 * panic button; leaving it unset defers to the owner.
 *
 * Precedence, in order:
 *   env "false" or any non-"true"  -> OFF  (operator kill switch)
 *   env "true"                     -> ON   (operator forces on)
 *   env unset                       -> the database row's value
 *
 * An explicit env value always wins in both directions, so a deployment can be
 * locked either open or shut without touching the row. When unset — the normal
 * case — the owner's Settings toggle decides.
 *
 * NOTE: this module is imported by client components (the Settings page uses
 * `envReconciliationOverride` to warn when a deployment has locked the
 * feature), so it must stay free of server-only imports. It contains no
 * database access at all — the stored value is passed in, and the server-side
 * gate that reads the database lives in `data/reconciliation-status.ts`.
 */

const ENV_VAR = "RECONCILIATION_ENABLED";

/**
 * The env var's intent, or null when it isn't set at all.
 * Only an exact "true" means on; anything else present means off.
 */
function envOverride(): boolean | null {
  const raw = process.env[ENV_VAR];
  if (raw === undefined) return null;
  return raw.trim().toLowerCase() === "true";
}

/**
 * Whether RECONCILIATION_ENABLED is set at all, and to what.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` into the client bundle at build
 * time and leaves other vars undefined there — so this returns null in the
 * browser by design. The Settings page uses it to detect that a deployment
 * has locked the feature and warn, rather than leaving someone to change a
 * checkbox that silently does nothing. On the server it reports the real
 * value.
 */
export function envReconciliationOverride(): boolean | null {
  return envOverride();
}

/**
 * Whether reconciliation may be used, given the database's own switch.
 *
 * `stored` is the PaymentConfig row's value. Returns false — never throws —
 * when there is no row at all, so a missing or not-yet-created config can't
 * accidentally leave an audit feature reachable.
 */
export function isReconciliationEnabled(stored: boolean | null | undefined): boolean {
  const override = envOverride();
  if (override !== null) return override;
  return stored === true;
}

/** Plain boolean for a client component. No secrets, no database access. */
export function reconciliationEnabledForClient(stored: boolean): boolean {
  return isReconciliationEnabled(stored);
}