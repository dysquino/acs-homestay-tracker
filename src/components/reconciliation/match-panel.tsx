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

/**
 * The reconciliation command panel (§9.2).
 *
 * The loop it serves: read a figure off the bank statement, type it, see which
 * recorded transaction it equals, confirm. Two safeguards are deliberate —
 * an exact figure suggests but never commits (§7.7), and the bank posting date
 * is an explicit field rather than an inference, because it's what decides
 * which month the match lands in.
 *
 * Fully controlled: the amount entry and the selected transaction live in the
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
  selected,
  onSelect,
  onClear,
  onConfirm,
  busy,
  error,
  monthLabel,
}: {
  entry: AmountEntry;
  onEntryChange: (entry: AmountEntry) => void;
  bankDate: string;
  onBankDateChange: (value: string) => void;
  inflows: PoolItem[];
  outflows: PoolItem[];
  selected: PoolItem | null;
  onSelect: (item: PoolItem) => void;
  onClear: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
  monthLabel: string;
}) {
  // The sign picks which pool is searched: a negative means outflows.
  const searching = entry.negative ? outflows : inflows;
  const candidates = exactCandidates(searching, entry);
  const amount = entryToAmount(entry);
  const canConfirm = selected !== null && amount !== null && !busy;

  function onKeyDown(e: React.KeyboardEvent) {
    const key = keyFromKeyboard(e.key);
    if (key) {
      e.preventDefault();
      onEntryChange(applyKey(entry, key));
    }
  }

  return (
    <Card className="h-fit">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Match to the bank</h2>
        <p className="text-xs text-slate-500">
          Type a figure from your statement for {monthLabel}.
        </p>
      </div>

      <div className="space-y-3 px-4 py-3" onKeyDown={onKeyDown}>
        <div>
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

        <div>
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

        <Numpad
          onPress={(key) => onEntryChange(applyKey(entry, key))}
          disabled={busy}
        />

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
                    selected?.key === c.key
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
          <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            Nothing matches that figure exactly. Pick the right transaction from the
            list beside this panel, or check the amount.
          </p>
        ) : null}

        {selected && amount !== null ? (
          <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
            Matching <span className="font-medium text-slate-900">{selected.label}</span> for{" "}
            <span className="font-medium text-slate-900">
              {formatCurrency(Math.abs(amount))}
            </span>{" "}
            against your {bankDate} statement.
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClear} disabled={busy}>
            Clear
          </Button>
          <Button className="flex-1" variant="primary" onClick={onConfirm} disabled={!canConfirm}>
            {busy ? "Matching…" : "Match it"}
          </Button>
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
