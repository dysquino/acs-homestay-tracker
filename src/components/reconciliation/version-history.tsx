"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  getSnapshotReport,
  getSnapshotVersions,
  type SnapshotReport,
} from "@/lib/data/reconciliation-audit";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";

/**
 * Report history (§8.11) — "the history page must allow users to inspect
 * previous finalized versions".
 *
 * Reads the frozen snapshot rather than rebuilding the month from live rows.
 * That distinction is the entire reason a snapshot exists: a report that
 * reconstructed itself would show today's guest names and today's expense
 * descriptions against last month's certified figures, so a correction would
 * silently rewrite history. Here, reopening a month and fixing a typo leaves
 * version 1 saying exactly what it said when it was sealed.
 */
export function VersionHistory({ month }: { month: string }) {
  const [versions, setVersions] = useState<
    { version: number; finalizedAt: string; finalizedBy: string; outstandingCount: number }[]
  >([]);
  const [open, setOpen] = useState<SnapshotReport | null>(null);
  const [loading, setLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      return await getSnapshotVersions(month);
    } catch {
      return [];
    }
  }, [month]);

  useEffect(() => {
    // `live` guards against a slower load for a previous month landing after a
    // faster one for the month the owner has since stepped into.
    let live = true;
    void (async () => {
      const rows = await load();
      if (live) setVersions(rows);
    })();
    return () => {
      live = false;
    };
  }, [load]);

  if (versions.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-slate-900">Report history</h2>
        <p className="mt-1 text-sm text-slate-500">
          No finalized versions yet. Each time this month is sealed, a copy of the report is
          kept here and never changes.
        </p>
      </Card>
    );
  }

  async function show(version: number) {
    if (open?.version === version) {
      setOpen(null);
      return;
    }
    setLoading(version);
    try {
      setOpen(await getSnapshotReport(month, version));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Report history</h2>
        <p className="text-xs text-slate-500">
          {versions.length} sealed version{versions.length === 1 ? "" : "s"}. Each is a frozen
          copy of the figures at the moment it was finalized.
        </p>
      </header>

      <ul className="divide-y divide-slate-100">
        {versions.map((v) => (
          <li key={v.version}>
            <button
              type="button"
              onClick={() => void show(v.version)}
              aria-expanded={open?.version === v.version}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">
                  Version {v.version}
                  {v.version === versions[0]?.version ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      latest
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-slate-500">
                  {v.finalizedAt.slice(0, 10)} · {v.finalizedBy}
                  {v.outstandingCount > 0
                    ? ` · ${v.outstandingCount} outstanding when sealed`
                    : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-brand-700">
                {loading === v.version ? "Loading…" : open?.version === v.version ? "Hide" : "View"}
              </span>
            </button>

            {open?.version === v.version ? <SnapshotDetail report={open} /> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The frozen figures, read straight off the snapshot.
 *
 * Narrow reads rather than a cast-and-hope: a snapshot written by an older
 * build could be missing fields, and an unchecked cast would render `undefined`
 * as if it were a certified number.
 */
function SnapshotDetail({ report }: { report: SnapshotReport }) {
  const summary = asRecord(report.summary);
  const ledger = asArray(report.ledger);

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <Figure label="Opening" value={asNumber(summary?.startingBalance)} />
        <Figure label="Calculated" value={asNumber(summary?.calculatedBalance)} />
        <Figure label="Statement closing" value={asNumber(summary?.endingBalance)} />
        <Figure label="Difference" value={asNumber(summary?.difference)} />
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <Figure label="Total in" value={asNumber(summary?.totalInflow)} />
        <Figure label="Total out" value={asNumber(summary?.totalOutflow)} />
        <Figure label="Matched" value={asNumber(summary?.matchedCount)} />
        <Figure label="Outstanding" value={asNumber(summary?.outstandingCount)} />
      </dl>

      {ledger.length > 0 ? (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-white">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {ledger.map((row, i) => {
                const r = asRecord(row);
                return (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-2 py-1 text-slate-500">
                      {asString(r?.bankPostedDate)?.slice(0, 10) || "—"}
                    </td>
                    <td className="px-2 py-1 text-slate-900">{asString(r?.label) ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {asNumber(r?.inflow) ? formatCurrency(asNumber(r?.inflow)!) : ""}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {asNumber(r?.outflow) ? formatCurrency(asNumber(r?.outflow)!) : ""}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums">
                      {formatCurrency(asNumber(r?.runningBalance) ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-2 text-[11px] text-slate-500">
        Frozen on {report.finalizedAt.slice(0, 10)} by {report.finalizedBy}. These figures are
        kept as they were and are not recalculated.
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          label === "Difference" ? "text-slate-900" : "text-slate-900",
        )}
      >
        {value === undefined ? "—" : formatCurrency(value)}
      </dd>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}