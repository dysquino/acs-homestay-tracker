"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import {
  applyKey,
  entryToAmount,
  exactCandidates,
  formatEntry,
  hasAmount,
  keyFromKeyboard,
  type AmountEntry,
  type Key,
} from "@/lib/amount-entry";
import type { PoolItem } from "@/lib/data/reconciliation";
import { toAmount, toCentavos } from "@/lib/finance";
import type { BatchTotals } from "@/lib/reconciliation-match-rules";
import { ChevronDownIcon } from "@/components/ui/icons";

/**
 * How open the mobile control sheet is (§10.4).
 *
 * Three states, because the list is the point on a phone and the controls are
 * something you reach for once per statement line:
 *
 * - `collapsed` — date, amount, and the handle. ~72–88px, so most of the
 *   transaction list stays visible and tappable.
 * - `half` — plus the current suggestion and the primary action, which is what
 *   you need to actually commit a match.
 * - `expanded` — plus the numpad and everything else, for typing a figure.
 *
 * Desktop ignores all three and renders the full panel, so the states can never
 * leave a desktop user with controls they can't reach.
 */
export type SheetState = "collapsed" | "half" | "expanded";

/**
 * The reconciliation command panel (§9.2).
 *
 * The loop it serves: read a figure off the bank statement, type it, see which
 * recorded transaction it equals, confirm. Two safeguards are deliberate —
 * an exact figure suggests but never commits (§7.7), and the bank posting date
 * is an explicit field rather than an inference, because it's what decides
 * which month the match lands in.
 *
 * The selection is a list rather than a single row because one statement line
 * regularly covers several records — an Airbnb payout for three stays lands as
 * one deposit (§7.10). With several selected, the typed figure stops being an
 * amount to write and becomes the check itself: the records must add up to it
 * exactly before the group can be confirmed.
 *
 * Fully controlled: the amount entry and the selected transactions live in the
 * page, so clicking a pool item and typing on the numpad feed the same state
 * without one having to be pushed into the other through an effect.
 */
export function MatchPanel({
  entry,
  onEntryChange,
  bankDate,
  onBankDateChange,
  inflows,
  outflows,
  selection,
  batch,
  mixed,
  onSelect,
  onClear,
  onConfirm,
  onAdjust,
  busy,
  error,
  monthLabel,
  sheetState,
  onSheetStateChange,
}: {
  entry: AmountEntry;
  onEntryChange: (entry: AmountEntry) => void;
  bankDate: string;
  onBankDateChange: (value: string) => void;
  inflows: PoolItem[];
  outflows: PoolItem[];
  selection: PoolItem[];
  batch: BatchTotals;
  /** True when the selection spans both pools, which no statement line can. */
  mixed: boolean;
  onSelect: (item: PoolItem) => void;
  onClear: () => void;
  onConfirm: () => void;
  /** Opens the adjustment form — the escape hatch when nothing matches. */
  onAdjust: () => void;
  busy: boolean;
  error: string | null;
  monthLabel: string;
  sheetState: SheetState;
  onSheetStateChange: (state: SheetState) => void;
}) {
  // The sign picks which pool is searched: a negative means outflows.
  const searching = entry.negative ? outflows : inflows;
  const candidates = exactCandidates(searching, entry);
  const amount = entryToAmount(entry);
  const statementCentavos = amount === null ? null : toCentavos(Math.abs(amount));

  const grouped = selection.length > 1;
  /** For a selection in one pool, exactly one of the two totals is non-zero. */
  const selectedCentavos = batch.inflowCentavos > 0n ? batch.inflowCentavos : batch.outflowCentavos;
  const linesUp = statementCentavos !== null && selectedCentavos === statementCentavos;

  /**
   * A single match may be partial — a receipt split across two deposits — so it
   * has nothing to tie out against. A group has to add up to the bank line it
   * claims to be, and the server refuses it otherwise (§7.10); disabling here
   * just means the owner finds out before submitting.
   */
  const canConfirm =
    selection.length > 0 && amount !== null && !busy && !mixed && (!grouped || linesUp);

  /**
   * Hide a section on a phone unless its state allows it, while leaving it
   * untouched on desktop. The `xl:block` is what makes the desktop panel whole
   * regardless of state — otherwise a collapsed sheet would quietly hide the
   * numpad from a wide browser too.
   */
  const onMobile = (allowed: boolean) => cn(!allowed && "hidden xl:block");

  function onKeyDown(e: React.KeyboardEvent) {
    const key = keyFromKeyboard(e.key);
    if (key) {
      e.preventDefault();
      onEntryChange(applyKey(entry, key));
    }
  }

  return (
    <Card
      className={cn(
        "h-fit",
        // A phone: a bottom sheet over the list, so the transactions stay
        // visible and tappable behind it. `dvh` rather than `vh` because mobile
        // browsers grow and shrink the viewport as chrome hides — §10.1.
        "fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] overflow-y-auto overscroll-contain rounded-b-none",
        "shadow-[0_-8px_28px_rgba(15,23,42,0.16)]",
        // A desktop: an ordinary column again, in the grid's left track.
        "xl:static xl:z-auto xl:max-h-none xl:overflow-visible xl:rounded-3xl",
        "xl:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]",
      )}
    >
      {/* Phone-only strip: the grab handle, the posting date, and the figure —
          the three things needed to know what the sheet is about without
          opening it (§10.4). Stays put in every state so the amount never
          disappears behind the handle. */}
      <div className="xl:hidden">
        <button
          type="button"
          onClick={() => onSheetStateChange(sheetState === "expanded" ? "collapsed" : "expanded")}
          aria-expanded={sheetState === "expanded"}
          aria-label={sheetState === "expanded" ? "Collapse the match sheet" : "Expand the match sheet"}
          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2 text-left"
        >
          <span aria-hidden="true" className="flex flex-col items-center gap-1">
            <span className="block h-1 w-9 rounded-full bg-slate-300" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-slate-500">
              Posting {bankDate}
            </span>
            <span
              className={cn(
                "block truncate text-sm font-semibold",
                entry.negative ? "text-rose-700" : "text-emerald-800",
              )}
            >
              {selection.length > 0
                ? `${batch.count} selected · ${formatCurrency(toAmount(selectedCentavos))}`
                : formatEntry(entry) || "₱0"}
            </span>
          </span>
          <ChevronDownIcon
            className={cn(
              "h-5 w-5 shrink-0 text-slate-400 transition-transform",
              sheetState === "expanded" && "rotate-180",
            )}
          />
        </button>
      </div>

      <div className="hidden border-b border-slate-100 px-4 py-3 xl:block">
        <h2 className="text-sm font-semibold text-slate-900">Match to the bank</h2>
        <p className="text-xs text-slate-500">
          Type a figure from your statement for {monthLabel}.
        </p>
      </div>

      <div className="space-y-3 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] xl:pb-3" onKeyDown={onKeyDown}>
        <div className={onMobile(sheetState !== "collapsed")}>
          <label htmlFor="bank-date" className="block text-xs font-medium text-slate-700">
            Bank posting date
          </label>
          <input
            id="bank-date"
            type="date"
            value={bankDate}
            onChange={(e) => onBankDateChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            Decides which month this match lands in — not when you typed it.
          </p>
        </div>

        <div className={onMobile(sheetState !== "collapsed")}>
          <p className="text-xs font-medium text-slate-700">Amount from statement</p>
          <p
            className={cn(
              "mt-1 rounded-lg px-3 py-2.5 text-2xl font-semibold tabular-nums",
              entry.negative ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800",
            )}
          >
            {formatEntry(entry) || "₱0"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {entry.negative ? "Looking in payouts." : "Looking in receipts."} Press − to
            switch.
          </p>
        </div>

        {/* The numpad is the reason to fully expand — it is the tallest thing
            here by far. The candidate list stays at half-open, because §10.4
            puts "the current suggestion" there and it is what the primary
            action is about to act on. */}
        <div className={onMobile(sheetState === "expanded")}>
          <Numpad
            onPress={(key) => onEntryChange(applyKey(entry, key))}
            disabled={busy}
          />
        </div>

        <div className={onMobile(sheetState !== "collapsed")}>
          {candidates.length > 0 ? (
          <ul className="space-y-1.5">
            <li className="text-xs font-medium text-slate-700">
              {candidates.length === 1
                ? "One exact match"
                : `${candidates.length} exact matches — pick one`}
            </li>
            {candidates.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm",
                    selection.some((s) => s.key === c.key)
                      ? "border-brand-600 bg-brand-50"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{c.label}</span>
                    <span className="block text-xs text-slate-500">
                      {c.detail}
                      {c.older ? " · earlier month" : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-medium tabular-nums text-slate-900">
                    {formatCurrency(c.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : hasAmount(entry) && searching.length > 0 ? (
          <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            <p>
              Nothing matches that figure exactly. Pick the right transaction from
              the list beside this panel, or check the amount.
            </p>
            <button
              type="button"
              onClick={onAdjust}
              className="mt-1.5 font-medium underline underline-offset-2"
            >
              Nothing on the bank matches — record an adjustment
            </button>
          </div>
        ) : null}
        </div>

        {/* Half-open and up: the suggestion and the primary action, which is
            what it takes to commit a match without expanding. */}
        <div className={onMobile(sheetState !== "collapsed")}>
        {grouped || mixed ? (
          <div
            className={cn(
              "rounded-lg p-2.5 text-xs",
              mixed
                ? "bg-amber-50 text-amber-800"
                : linesUp
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-50 text-slate-600",
            )}
          >
            <p className="font-medium text-slate-900">
              {mixed
                ? `${batch.count} selected across both pools`
                : `${batch.count} selected · ${formatCurrency(toAmount(selectedCentavos))}`}
            </p>
            {mixed ? (
              <p className="mt-1">
                Money in and money out can&apos;t share one statement line. Deselect one of
                them and match separately.
              </p>
            ) : linesUp ? (
              <p className="mt-1">
                Adds up to the {formatCurrency(Math.abs(amount ?? 0))} on your {bankDate}{" "}
                statement — one bank line covering {batch.count} records.
              </p>
            ) : (
              <p className="mt-1">
                These add up to {formatCurrency(toAmount(selectedCentavos))}, but your
                statement says {formatCurrency(Math.abs(amount ?? 0))}. Adjust the
                selection until the two agree.
              </p>
            )}
          </div>
        ) : selection.length > 0 ? (
          <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
            Matching <span className="font-medium text-slate-900">{selection[0].label}</span>{" "}
            for{" "}
            <span className="font-medium text-slate-900">
              {formatCurrency(Math.abs(amount ?? 0))}
            </span>{" "}
            against your {bankDate} statement.
          </div>
        ) : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        {/* Wrapped rather than hidden directly: `hidden` and `flex` are both
            display utilities, so applying them to one element would leave the
            winner up to stylesheet order rather than intent. */}
        <div className={onMobile(sheetState !== "collapsed")}>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClear} disabled={busy}>
            Clear
          </Button>
          <Button className="flex-1" variant="primary" onClick={onConfirm} disabled={!canConfirm}>
            {busy ? "Matching…" : grouped ? `Match ${batch.count} as one` : "Match it"}
          </Button>
        </div>
        </div>
      </div>
    </Card>
  );
}

function Numpad({
  onPress,
  disabled,
}: {
  onPress: (key: Key) => void;
  disabled: boolean;
}) {
  const keys: { label: string; key?: Key }[] = [
    { label: "1", key: { type: "digit", digit: "1" } },
    { label: "2", key: { type: "digit", digit: "2" } },
    { label: "3", key: { type: "digit", digit: "3" } },
    { label: "4", key: { type: "digit", digit: "4" } },
    { label: "5", key: { type: "digit", digit: "5" } },
    { label: "6", key: { type: "digit", digit: "6" } },
    { label: "7", key: { type: "digit", digit: "7" } },
    { label: "8", key: { type: "digit", digit: "8" } },
    { label: "9", key: { type: "digit", digit: "9" } },
    { label: "−", key: { type: "toggle-sign" } },
    { label: "0", key: { type: "digit", digit: "0" } },
    { label: ".", key: { type: "dot" } },
    { label: "⌫", key: { type: "backspace" } },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {keys.map((k, i) => (
        <button
          key={i}
          type="button"
          onClick={() => k.key && onPress(k.key)}
          disabled={disabled}
          aria-label={KEYPAD_LABELS[k.label] ?? k.label}
          className="rounded-lg border border-slate-200 bg-white py-3 text-lg font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 pointer-coarse:py-4"
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

const KEYPAD_LABELS: Record<string, string> = {
  "−": "Switch to payouts",
  "⌫": "Backspace",
  ".": "Decimal point",
};
