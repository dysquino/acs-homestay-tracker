"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdjustmentForm } from "@/components/reconciliation/adjustment-form";
import { AuditWizard } from "@/components/reconciliation/audit-wizard";
import { MatchPanel, type SheetState } from "@/components/reconciliation/match-panel";
import { PayoutWorklist } from "@/components/reconciliation/payout-worklist";
import {
  centsToDigits,
  EMPTY_ENTRY,
  entryToAmount,
  type AmountEntry,
} from "@/lib/amount-entry";
import {
  createGroupedMatches,
  createMatch,
  reverseMatch,
  voidAdjustment as voidAdjustmentAction,
} from "@/lib/data/reconciliation-matches";
import { cn } from "@/lib/cn";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { StatTile } from "@/components/ui/stat";
import {
  getWorkspaceMonth,
  type PoolItem,
  type WorkspaceMonth,
} from "@/lib/data/reconciliation";
import { toAmount } from "@/lib/finance";
import {
  countByKind,
  FILTERS,
  filterByKind,
  type PoolFilter,
} from "@/lib/reconciliation-filters";
import { addMonths, startOfMonth, today } from "@/lib/dates";
import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { useIdentity } from "@/lib/identity";
import {
  batchTotals,
  matchSourceType,
  type BatchCandidate,
} from "@/lib/reconciliation-match-rules";
import { useStore } from "@/lib/store";

/** Pool rows carry Prisma's enum names; the rules work in match source types. */
function toCandidate(item: PoolItem): BatchCandidate {
  return {
    sourceType: matchSourceType(item.sourceType),
    sourceId: item.sourceId,
    amount: item.amount,
  };
}

/**
 * The reconciliation workspace (§7), read-only for now.
 *
 * Two lists of money that the bank has yet to confirm: recorded receipts
 * waiting to be matched to a deposit, and recorded payouts waiting to be
 * matched to a debit. Typing an amount to match against comes with the
 * keypad pass — that's the part that wants real statement data in front of it,
 * so this ships as the review surface rather than a half-built matcher.
 *
 * Pools are scoped by each record's OWN date (when money arrived or left), so
 * "October" here means "everything recorded in October", not "everything that
 * posted in October". The difference shows up as an `older` marker on records
 * carried over from a previous month (§4.8).
 */
export default function ReconciliationPage() {
  const { reconciliationEnabled } = useStore();
  // Held as 'YYYY-MM'; stepping reuses the shared date helpers so the year
  // rollover in December is handled in one place.
  const [month, setMonth] = useState(() => startOfMonth(today()).slice(0, 7));
  const shift = (delta: number) =>
    setMonth(startOfMonth(addMonths(`${month}-01`, delta)).slice(0, 7));
  const [data, setData] = useState<WorkspaceMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The transactions the owner is matching right now, in tap order. One item is
   * an ordinary match; several are one statement line covering several records
   * (§7.10), so the shape carries both cases rather than having a separate batch
   * mode that could disagree with the single one.
   */
  const [selection, setSelection] = useState<PoolItem[]>([]);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [entry, setEntry] = useState<AmountEntry>(EMPTY_ENTRY);
  const [bankDate, setBankDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  /**
   * Starts collapsed on a phone so the transaction list is the first thing
   * visible (§10.3); on a desktop the panel is in the grid regardless and the
   * state is ignored, so there is nothing to detect here.
   */
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [filter, setFilter] = useState<PoolFilter>("AUTO");
  /** The Monthly Audit wizard (§6.3) runs inside this route, full screen. */
  const [auditing, setAuditing] = useState(false);
  const { user } = useIdentity();

  /** Running totals for the selection bar (§7.11). Exact, in centavos. */
  const batch = useMemo(() => batchTotals(selection.map(toCandidate)), [selection]);
  /** A selection spanning both pools can never be one statement line. */
  const mixed = batch.inflowCentavos > 0n && batch.outflowCentavos > 0n;

  /**
   * How many history rows share each statement line. A grouped match writes one
   * row per record, so without this the owner sees three entries for one deposit
   * and can't tell them apart from three separate deposits.
   */
  const groupSizes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of data?.history ?? []) {
      if (!h.statementGroupKey) continue;
      counts.set(h.statementGroupKey, (counts.get(h.statementGroupKey) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  /** Every outstanding row this month, for the filter chips' counts. */
  const allOutstanding = useMemo(
    () => [...(data?.inflows ?? []), ...(data?.outflows ?? [])],
    [data],
  );
  /**
   * The pools narrowed to the active filter (§7.5). Filtering the rows already
   * in memory rather than re-querying: the month is loaded as a whole, and a
   * filter that hit the database would make changing chips feel slow and could
   * disagree with the totals above if the two were ever read separately.
   */
  const visibleInflows = useMemo(() => filterByKind(data?.inflows ?? [], filter), [data, filter]);
  const visibleOutflows = useMemo(() => filterByKind(data?.outflows ?? [], filter), [data, filter]);

  /**
   * Tapping a transaction adds or removes it, then re-seeds the amount from what
   * is now selected. The typed figure is the owner's reading of one bank line,
   * so it should always show what the bar is claiming — seeding it on every tap
   * means adding a second stay updates both together instead of leaving a stale
   * total sitting next to a three-item selection.
   *
   * A mixed selection gets an empty amount rather than a sum, because a sum of
   * receipts and payouts is a number with no meaning. Confirm stays disabled and
   * the panel explains why.
   */
  const pick = useCallback(
    (item: PoolItem) => {
      const next = selection.some((p) => p.key === item.key)
        ? selection.filter((p) => p.key !== item.key)
        : [...selection, item];
      const nextBatch = batchTotals(next.map(toCandidate));
      const spansBothPools =
        nextBatch.inflowCentavos > 0n && nextBatch.outflowCentavos > 0n;
      // One pool at a time, so exactly one side is non-zero and there's no
      // sign to strip. Widened from centavos rather than summed as floats.
      const nextSelected =
        nextBatch.inflowCentavos > 0n ? nextBatch.inflowCentavos : nextBatch.outflowCentavos;
      setSelection(next);
      // On a phone the sheet starts collapsed so the list is the first thing
      // visible; picking a transaction is a request to act on it, so open it to
      // the point where the confirm button is reachable. No visual effect on
      // desktop, where the panel is already fully visible.
      if (next.length > 0) setSheetState("half");
      setEntry(
        spansBothPools || next.length === 0
          ? EMPTY_ENTRY
          : { digits: centsToDigits(toAmount(nextSelected)), negative: false },
      );
      setMatchError(null);
    },
    [selection],
  );

  function clearMatch() {
    setEntry(EMPTY_ENTRY);
    setSelection([]);
    setMatchError(null);
  }

  async function confirmMatch() {
    const typed = entryToAmount(entry);
    if (typed === null || selection.length === 0) return;
    const statement = Math.abs(typed);
    setBusy(true);
    setMatchError(null);
    try {
      if (selection.length === 1) {
        // One record, possibly partially matched — a receipt split across two
        // deposits keeps the typed amount, not the record's full value (§7.10).
        const item = selection[0];
        await createMatch({
          sourceType: matchSourceType(item.sourceType),
          sourceId: item.sourceId,
          amount: statement,
          bankPostedDate: bankDate,
          matchedBy: user?.name ?? "Unknown",
        });
      } else {
        // A group covers a statement line in full, so each record contributes its
        // whole outstanding amount and the typed figure is the tie-out check.
        await createGroupedMatches(
          selection.map(toCandidate),
          {
            bankPostedDate: bankDate,
            statementAmount: statement,
            matchedBy: user?.name ?? "Unknown",
          },
        );
      }
      clearMatch();
      await reload();
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : "Couldn't record that match.");
    } finally {
      setBusy(false);
    }
  }

  /** Re-read the month after a write. Declared after `load` is defined. */
  const reload = useCallback(async () => {
    try {
      setData(await getWorkspaceMonth(month));
    } catch {
      setError("Couldn't refresh after that change.");
    }
  }, [month]);

  /**
   * Undo a match, putting the transaction back in the pool (§7.13).
   * Reversal, never deletion — the match stays in the audit trail.
   */
  const undo = useCallback(
    async (matchId: string) => {
      setUndoing(matchId);
      try {
        await reverseMatch(matchId, user?.name ?? "Unknown");
        await reload();
      } catch {
        setError("Couldn't undo that match.");
      } finally {
        setUndoing(null);
      }
    },
    [reload, user],
  );

  const voidAdjustment = useCallback(
    async (id: string) => {
      setUndoing(id);
      try {
        await voidAdjustmentAction(id, user?.name ?? "Unknown");
        await reload();
      } catch {
        setError("Couldn't void that adjustment.");
      } finally {
        setUndoing(null);
      }
    },
    [reload, user],
  );


  useEffect(() => {
    // Guard against a slow earlier month overwriting a faster later one when
    // the owner taps through the arrows quickly.
    let live = true;
    void (async () => {
      try {
        const rows = await getWorkspaceMonth(month);
        if (live) {
          setData(rows);
          setError(null);
        }
      } catch {
        if (live) setError("Couldn't load this month's reconciliation.");
      }
    })();
    return () => {
      live = false;
    };
  }, [month]);

  if (!reconciliationEnabled) {
    return (
      <>
        <PageHeader title="Reconciliation" />
        <Card className="max-w-xl p-5">
          <p className="text-sm font-medium text-slate-900">
            Reconciliation is switched off.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Turn on &ldquo;Enable reconciliation&rdquo; in Payment Settings to start
            matching recorded payments and payouts against the bank.
          </p>
        </Card>
      </>
    );
  }

  if (auditing) {
    return (
      <AuditWizard
        month={month}
        onClose={() => setAuditing(false)}
        onLeaveReview={() => setAuditing(false)}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Recorded money waiting to be matched to your bank account."
        action={
          <Button variant="primary" onClick={() => setAuditing(true)} className="w-full sm:w-auto">
            Monthly Audit
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-2">
        <Button size="sm" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <Button size="sm" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
        <h2 className="ml-1 text-sm font-semibold text-slate-900">
          {formatMonth(`${month}-01`)}
        </h2>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatTile
          compact
          label="Matched in"
          value={formatCurrency(data?.matchedInTotal ?? 0)}
          tone="positive"
        />
        <StatTile
          compact
          label="Matched out"
          value={formatCurrency(data?.matchedOutTotal ?? 0)}
          tone="negative"
        />
        <StatTile
          compact
          label="Waiting in"
          value={formatCurrency(data?.unmatchedInTotal ?? 0)}
          hint={
            data?.olderInCount
              ? `${data.olderInCount} from earlier months`
              : undefined
          }
        />
        <StatTile
          compact
          label="Waiting out"
          value={formatCurrency(data?.unmatchedOutTotal ?? 0)}
          hint={
            data?.olderOutCount
              ? `${data.olderOutCount} from earlier months`
              : undefined
          }
        />
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {data === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <MatchPanel
            entry={entry}
            onEntryChange={setEntry}
            bankDate={bankDate}
            onBankDateChange={setBankDate}
            inflows={data.inflows}
            outflows={data.outflows}
            selection={selection}
            batch={batch}
            mixed={mixed}
            onSelect={pick}
            onClear={clearMatch}
            onConfirm={confirmMatch}
            onAdjust={() => setAdjusting(true)}
            busy={busy}
            error={matchError}
            monthLabel={formatMonth(`${month}-01`)}
            sheetState={sheetState}
            onSheetStateChange={setSheetState}
          />
          <div className="grid gap-5">
            <PayoutWorklist onRecorded={reload} />
            <FilterChips
              value={filter}
              onChange={setFilter}
              counts={allOutstanding}
            />
            <Pool
              title="Money in"
              subtitle="Recorded receipts that haven't been matched to a deposit yet."
              items={visibleInflows}
              empty={poolEmpty(data.recordedInCount, "receipt", filter)}
              tone="in"
              selectedKeys={selection.map((s) => s.key)}
              onSelect={pick}
            />
            <Pool
              title="Money out"
              subtitle="Recorded payouts that haven't been matched to a debit yet."
              items={visibleOutflows}
              empty={poolEmpty(data.recordedOutCount, "payout", filter)}
              tone="out"
              selectedKeys={selection.map((s) => s.key)}
              onSelect={pick}
            />
          </div>
        </div>
      )}

      {/* Clears the fixed sheet so the last row of the month stays reachable on
          a phone — the sheet is out of flow, so without this the bottom of the
          list sits underneath it. */}
      <div aria-hidden="true" className="h-24 xl:hidden" />

      <AdjustmentForm
        open={adjusting}
        defaultDate={bankDate}
        onClose={() => setAdjusting(false)}
        onSaved={async () => {
          setAdjusting(false);
          await reload();
        }}
      />

      <Card className="mt-5">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">Matched this month</h2>
          <p className="text-xs text-slate-500">
            Matched against the bank by posting date, not by the record&apos;s own date.
          </p>
        </div>
        {data === null ? null : data.history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">
            Nothing matched yet. Pick a transaction and match it, or type its amount on the left.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.history.map((h) => (
              <li key={h.key} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{h.label}</p>
                  <p className="text-xs text-slate-500">
                    {formatShortDate(h.bankPostedDate)}
                    {h.detail ? ` · ${h.detail}` : ""} · {h.matchedBy}
                    {h.statementGroupKey && (groupSizes.get(h.statementGroupKey) ?? 0) > 1
                      ? " · one statement line"
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p
                    className={`whitespace-nowrap font-medium tabular-nums ${
                      h.sourceType === "booking_payment" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {formatCurrency(h.amount)}
                  </p>
                  {h.sourceType === "adjustment" ? (
                    <button
                      type="button"
                      onClick={() => voidAdjustment(h.key)}
                      disabled={undoing === h.key}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    >
                      {undoing === h.key ? "Voiding…" : "Void"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => undo(h.key)}
                      disabled={undoing === h.key}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    >
                      {undoing === h.key ? "Undoing…" : "Undo"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/**
 * The empty-state line for a pool.
 *
 * "Nothing here" has two very different causes and the interface has to tell
 * them apart: work finished, or work never started. Telling an owner that every
 * receipt has been matched when no receipt was ever recorded is the more
 * damaging of the two errors — it reads as a completed month.
 */
function poolEmpty(
  recorded: number,
  noun: "receipt" | "payout",
  filter: PoolFilter,
): string {
  if (recorded === 0) {
    return filter === "AUTO"
      ? `No ${noun}s recorded for this month yet. Record one first — matching only works against money you've already entered.`
      : `No ${noun}s recorded for this month at all, so there is nothing for this filter to show.`;
  }
  if (filter !== "AUTO") return `No ${noun}s left under this filter.`;
  return `Every ${noun} recorded this month has been matched.`;
}

/**
 * The pool filters (§7.5), with the count each one would leave visible.
 *
 * Counts are shown even for a filter that currently matches nothing: "Refunds 0"
 * is the answer to "are there any refunds left?", which is otherwise a question
 * the interface can't answer without switching to the filter and finding out.
 */
function FilterChips({
  value,
  onChange,
  counts,
}: {
  value: PoolFilter;
  onChange: (value: PoolFilter) => void;
  counts: PoolItem[];
}) {
  return (
    <div
      role="group"
      aria-label="Filter transactions"
      className="flex flex-wrap gap-1.5"
    >
      {FILTERS.map((f) => {
        const active = f.value === value;
        const n = countByKind(counts, f.value);
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:py-2.5",
              active
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
            <span className={active ? "text-brand-100" : "text-slate-400"}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pool({
  title,
  subtitle,
  items,
  empty,
  tone,
  selectedKeys,
  onSelect,
}: {
  title: string;
  subtitle: string;
  items: PoolItem[];
  empty: string;
  tone: "in" | "out";
  selectedKeys: string[];
  onSelect: (item: PoolItem) => void;
}) {
  // A Set so `includes` stays cheap once a month has a long pool, and so the
  // row check reads as membership rather than an array scan in a render loop.
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  return (
    <Card className="h-fit">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-900">
          {title}
          <span className="ml-2 text-xs font-normal text-slate-500">{items.length}</span>
        </h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const isSelected = selected.has(item.key);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors sm:px-5",
                    isSelected ? "bg-brand-50 ring-1 ring-inset ring-brand-600" : "hover:bg-slate-50",
                  )}
                >
                  {/* The box makes it obvious a tap adds to the selection rather
                      than replacing it, which is what lets one statement line
                      cover several records. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                      isSelected
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-300 bg-white text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{item.label}</span>
                    <span className="block text-xs text-slate-500">
                      {formatShortDate(item.date)} · {item.detail}
                      {item.reference ? ` · ${item.reference}` : ""}
                    </span>
                    {item.older ? (
                      <span className="block text-xs text-amber-700">
                        Carried over from an earlier month
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 whitespace-nowrap font-medium tabular-nums ${
                      tone === "in" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {formatCurrency(item.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}