"use client";

import { formatExactCentavos } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { formatCurrency, formatShortDate } from "@/lib/format";
import {
  CATEGORY_LABELS,
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  type LedgerRow,
  type OutstandingItem,
  type PeriodCategory,
  type PeriodTotals,
} from "@/lib/reconciliation-period";

/**
 * The Verify stage (§8.5, §8.7, §8.8).
 *
 * The number that matters is the difference, and the rule is that it is shown
 * the same way the server checks it — exact zero, no rounding for comfort. A
 * ₱0.01 that displays as "about zero" and finalizes is worse than one that
 * plainly doesn't tie out, so this renders `formatExactCentavos` rather than a
 * currency formatter.
 *
 * The breakdown leads and the difference follows. A single difference tells the
 * owner whether the month works and nothing about why, and a breakdown that only
 * appears once the difference is zero has been useless at exactly the moment it
 * was needed.
 */
export function VerifyStage({
  totals,
  ledger,
  outstanding,
  blocker,
  readOnly,
  onFinalize,
  onReopen,
  busy,
  status,
}: {
  totals: PeriodTotals;
  ledger: LedgerRow[];
  outstanding: OutstandingItem[];
  blocker: string | null;
  /** A finalized month shows the same report, but offers no writes. */
  readOnly: boolean;
  onFinalize: () => void;
  onReopen: () => void;
  busy: boolean;
  status: "DRAFT" | "FINALIZED" | "REOPENED";
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-5">
        <Breakdown totals={totals} />
        <LedgerTable rows={ledger} />
      </div>

      <div className="grid content-start gap-5">
        <DifferenceCard totals={totals} blocker={blocker} />

        {outstanding.length > 0 ? (
          <OutstandingCard items={outstanding} totals={totals} />
        ) : null}

        <div className="rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
          {readOnly ? (
            <>
              <p className="text-sm font-medium text-slate-900">
                {status === "FINALIZED" ? "This month is sealed." : "This month is finalized."}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Reconciliation changes are locked. Reopen it if something needs
                correcting — the report you sealed is kept either way.
              </p>
              <button
                type="button"
                onClick={onReopen}
                disabled={busy}
                className="mt-3 w-full rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {busy ? "Working…" : "Reopen this month"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">Finalize</p>
              <p className="mt-1 text-xs text-slate-600">
                Seals the month and writes a report that records these figures,
                who sealed it, and when. You can reopen it later with a reason.
              </p>
              <button
                type="button"
                onClick={onFinalize}
                disabled={busy || blocker !== null}
                className="mt-3 w-full rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {busy ? "Finalizing…" : "Finalize the month"}
              </button>
              {blocker ? <p className="mt-2 text-xs text-slate-500">{blocker}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Breakdown({ totals }: { totals: PeriodTotals }) {
  const rows: { category: PeriodCategory; cents: bigint }[] = [
    ...INFLOW_CATEGORIES.map((c) => ({ category: c, cents: totals.byCategory[c] })),
    ...OUTFLOW_CATEGORIES.map((c) => ({ category: c, cents: totals.byCategory[c] })),
  ].filter((r) => r.cents !== 0n);

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
      <header className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-900">This month in full</h2>
        <p className="text-xs text-slate-500">
          {totals.matchedCount} matched movement{totals.matchedCount === 1 ? "" : "s"}.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">
          Nothing matched in this month yet.
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.category}>
                <td className="px-4 py-2 sm:px-5">{CATEGORY_LABELS[r.category]}</td>
                <td
                  className={cn(
                    "whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums sm:px-5",
                    INFLOW_CATEGORIES.includes(r.category) ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {formatExactCentavos(r.cents)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-4 py-2 font-medium sm:px-5">Total inflow</td>
              <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-emerald-700 sm:px-5">
                {formatExactCentavos(totals.totalInflowCentavos)}
              </td>
            </tr>
            <tr className="bg-slate-50">
              <td className="px-4 py-2 font-medium sm:px-5">Total outflow</td>
              <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-rose-700 sm:px-5">
                {formatExactCentavos(totals.totalOutflowCentavos)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * The difference, shown as pesos even on the left so it reads as a peso figure.
 *
 * `formatExactCentavos` would render a centavo difference as "0.01" with no
 * unit, which is the wrong impression for a balance.
 */
function DifferenceCard({
  totals,
  blocker,
}: {
  totals: PeriodTotals;
  blocker: string | null;
}) {
  const ok = totals.reconciled;
  return (
    <section
      className={cn(
        "rounded-3xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]",
        ok ? "bg-white" : "bg-amber-50",
      )}
    >
      <h2 className="text-sm font-semibold text-slate-900">Balance</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="Statement opening" cents={totals.startingBalanceCentavos} />
        <Row label="Calculated balance" cents={totals.calculatedBalanceCentavos} />
        <Row label="Statement closing" cents={totals.endingBalanceCentavos} />
      </dl>
      <div
        className={cn(
          "mt-3 border-t pt-3",
          ok ? "border-emerald-200" : "border-amber-300",
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-900">Difference</span>
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              ok ? "text-emerald-700" : "text-amber-800",
            )}
          >
            {pesos(totals.differenceCentavos)}
          </span>
        </div>
        <p className={cn("mt-1 text-xs", ok ? "text-emerald-700" : "text-amber-800")}>
          {ok ? "This balances to the centavo." : blocker}
        </p>
      </div>
    </section>
  );
}

function Row({ label, cents }: { label: string; cents: bigint }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium tabular-nums text-slate-900">{pesos(cents)}</dd>
    </div>
  );
}

function OutstandingCard({
  items,
  totals,
}: {
  items: OutstandingItem[];
  totals: PeriodTotals;
}) {
  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Still outstanding · {items.length}
        </h2>
        <p className="text-xs text-slate-500">
          {formatCurrency(Number(formatExactCentavos(totals.outstandingValueCentavos)) / 100)}
          recorded here that the bank hasn&apos;t confirmed.
        </p>
      </header>
      <ul className="divide-y divide-slate-100">
        {items.slice(0, 8).map((o) => (
          <li key={`${o.sourceType}:${o.sourceId}`} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900">{o.label}</span>
              <span className="block text-xs text-slate-500">
                {formatShortDate(o.recordDate)} · {o.detail}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">
              {formatCurrency(o.amount)}
            </span>
          </li>
        ))}
      </ul>
      {items.length > 8 ? (
        <p className="px-4 py-2 text-xs text-slate-500">
          and {items.length - 8} more — they stay in the pool for a later month.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The virtual ledger (§8.7).
 *
 * A table on desktop. The running balance is a column rather than something the
 * reader has to compute, because the point of the ledger is to show *where* the
 * balance went — and on a phone it becomes a timeline below the table rather
 * than disappearing.
 */
function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const movements = rows.filter((r) => r.kind === "MOVEMENT");
  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
      <header className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-900">Ledger</h2>
        <p className="text-xs text-slate-500">
          In the order the bank posted them, with a running balance.
        </p>
      </header>

      {movements.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">No movements to show.</p>
      ) : (
        <>
          {/* Desktop: a table. */}
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium sm:px-5">Posted</th>
                <th className="px-4 py-2 font-medium sm:px-5">Detail</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">In</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Out</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50">
                <td className="px-4 py-2 sm:px-5" colSpan={4}>
                  <span className="font-medium text-slate-700">Opening balance</span>
                </td>
                <td className="px-4 py-2 text-right font-medium tabular-nums sm:px-5">
                  {pesos(rows[0]?.runningBalanceCentavos ?? 0n)}
                </td>
              </tr>
              {movements.map((r, i) => (
                <tr key={`${r.reference}-${i}`}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500 sm:px-5">
                    {r.bankPostedDate ? formatShortDate(r.bankPostedDate) : ""}
                  </td>
                  <td className="px-4 py-2 sm:px-5">
                    <span className="block font-medium text-slate-900">{r.label}</span>
                    <span className="block text-xs text-slate-500">
                      {r.detail}
                      {r.statementGroupKey ? " · one statement line" : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-emerald-700 sm:px-5">
                    {r.inflowCentavos > 0n ? pesos(r.inflowCentavos) : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-rose-700 sm:px-5">
                    {r.outflowCentavos > 0n ? pesos(r.outflowCentavos) : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums sm:px-5">
                    {pesos(r.runningBalanceCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: a timeline, with the balance on every row (§10.3). */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            <li className="bg-slate-50 px-4 py-2.5 text-sm">
              <span className="text-slate-600">Opening balance</span>
              <span className="ml-2 font-medium tabular-nums">
                {pesos(rows[0]?.runningBalanceCentavos ?? 0n)}
              </span>
            </li>
            {movements.map((r, i) => (
              <li key={`${r.reference}-${i}`} className="px-4 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{r.label}</p>
                    <p className="text-xs text-slate-500">
                      {r.bankPostedDate ? formatShortDate(r.bankPostedDate) : ""} · {r.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${
                      r.inflowCentavos > 0n ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {pesos(r.inflowCentavos > 0n ? r.inflowCentavos : r.outflowCentavos)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Balance {pesos(r.runningBalanceCentavos)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function pesos(centavos: bigint): string {
  const negative = centavos < 0n;
  return `${negative ? "−" : ""}₱${formatExactCentavos(centavos < 0n ? -centavos : centavos)}`;
}