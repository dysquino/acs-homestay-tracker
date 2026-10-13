"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { StatTile } from "@/components/ui/stat";
import {
  getWorkspaceMonth,
  type PoolItem,
  type WorkspaceMonth,
} from "@/lib/data/reconciliation";
import { addMonths, startOfMonth, today } from "@/lib/dates";
import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { useStore } from "@/lib/store";

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

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Recorded money waiting to be matched to your bank account."
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
        <div className="grid gap-5 xl:grid-cols-2">
          <Pool
            title="Money in"
            subtitle="Recorded receipts that haven't been matched to a deposit yet."
            items={data.inflows}
            empty="Every receipt recorded this month has been matched."
            tone="in"
          />
          <Pool
            title="Money out"
            subtitle="Recorded payouts that haven't been matched to a debit yet."
            items={data.outflows}
            empty="Every payout recorded this month has been matched."
            tone="out"
          />
        </div>
      )}

      <Card className="mt-5">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">Matched this month</h2>
          <p className="text-xs text-slate-500">
            Matched against the bank by posting date, not by the record&apos;s own date.
          </p>
        </div>
        {data === null ? null : data.history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">
            Nothing matched yet. Matching comes with the next pass.
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
                  </p>
                </div>
                <p
                  className={`whitespace-nowrap font-medium tabular-nums ${
                    h.sourceType === "booking_payment" ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {formatCurrency(h.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Pool({
  title,
  subtitle,
  items,
  empty,
  tone,
}: {
  title: string;
  subtitle: string;
  items: PoolItem[];
  empty: string;
  tone: "in" | "out";
}) {
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
          {items.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-500">
                  {formatShortDate(item.date)} · {item.detail}
                  {item.reference ? ` · ${item.reference}` : ""}
                </p>
                {item.older ? (
                  <p className="text-xs text-amber-700">Carried over from an earlier month</p>
                ) : null}
              </div>
              <p
                className={`whitespace-nowrap font-medium tabular-nums ${
                  tone === "in" ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatCurrency(item.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}