"use client";

import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WarningIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { parseAirbnbCsv, planImport, type ParseResult, type PlannedRow } from "@/lib/airbnb-import";
import { DEFAULT_CLEANING_FEE } from "@/lib/constants";
import { nightCount } from "@/lib/dates";
import { formatCurrency, formatDateRange } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useSubmit } from "@/lib/use-submit";
import type { ImportResult } from "@/lib/data/import";

type Stage =
  | { name: "pick" }
  | { name: "preview"; parsed: ParseResult; fileName: string }
  | { name: "done"; result: ImportResult };

/**
 * Import from Airbnb's "Transaction history" CSV. Nothing is written until the
 * user has seen, per row, exactly what will happen (new / update / already
 * imported) and confirmed.
 */
export function AirbnbImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bookings, importBookings } = useStore();
  const submit = useSubmit();
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo<PlannedRow[]>(
    () => (stage.name === "preview" ? planImport(stage.parsed.rows, bookings) : []),
    [stage, bookings],
  );
  const actionable = plan.filter((p) => p.action !== "skip");
  const chosen = actionable.filter((p) => !unselected.has(p.row.confirmationCode));

  function close() {
    setStage({ name: "pick" });
    setUnselected(new Set());
    setError(null);
    onClose();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const parsed = parseAirbnbCsv(await file.text());
      setUnselected(new Set());
      setStage({ name: "preview", parsed, fileName: file.name });
    } catch {
      setError("Couldn't read that file. Export it from Airbnb again and retry.");
    }
  }

  async function confirm() {
    setError(null);
    await submit.run(async () => {
      try {
        const result = await importBookings(
          chosen.map((p) => ({
            action: p.action === "update" ? "update" : "create",
            bookingId: p.action === "update" ? p.bookingId : undefined,
            confirmationCode: p.row.confirmationCode,
            guestName: p.row.guestName,
            checkIn: p.row.checkIn,
            checkOut: p.row.checkOut,
            totalPayout: p.row.totalPayout,
            platformFee: p.row.platformFee,
          })),
        );
        setStage({ name: "done", result });
      } catch {
        setError("Nothing was imported — the import failed as a whole. Please try again.");
      }
    });
  }

  const toggle = (code: string) =>
    setUnselected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Import from Airbnb"
      description="Upload the CSV from Airbnb → Earnings → Transaction history → Export."
      footer={
        stage.name === "done" ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            {stage.name === "preview" ? (
              <Button variant="primary" disabled={chosen.length === 0 || submit.saving} onClick={confirm}>
                {submit.saving
                  ? "Importing…"
                  : chosen.length === 0
                    ? "Nothing to import"
                    : `Import ${chosen.length} booking${chosen.length === 1 ? "" : "s"}`}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {stage.name === "pick" ? (
        <div className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-10 text-center transition-colors hover:border-brand-600 hover:bg-brand-50/40"
          >
            <span className="text-sm font-medium text-slate-900">Choose the Airbnb CSV file</span>
            <span className="text-xs text-slate-500">You&apos;ll see a preview before anything is saved.</span>
          </button>
          <RulesNote />
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
        </div>
      ) : null}

      {stage.name === "preview" ? (
        <div className="space-y-4">
          {stage.parsed.rows.length === 0 ? (
            <Problems problems={stage.parsed.problems} tone="error" />
          ) : (
            <>
              <p className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">{stage.parsed.rows.length} reservations</span> in{" "}
                {stage.fileName}:{" "}
                {plan.filter((p) => p.action === "create").length} new,{" "}
                {plan.filter((p) => p.action === "update").length} to update,{" "}
                {plan.filter((p) => p.action === "skip").length} already imported.
              </p>
              <RulesNote />

              <div className="max-h-80 overflow-auto rounded-2xl ring-1 ring-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 font-semibold">Guest</th>
                      <th className="px-3 py-2 font-semibold">Stay</th>
                      <th className="px-3 py-2 text-right font-semibold">Payout</th>
                      <th className="px-3 py-2 font-semibold">What happens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.map((p) => (
                      <PreviewRow
                        key={p.row.confirmationCode}
                        p={p}
                        checked={p.action !== "skip" && !unselected.has(p.row.confirmationCode)}
                        onToggle={() => toggle(p.row.confirmationCode)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {stage.parsed.problems.length > 0 ? (
                <Problems problems={stage.parsed.problems} tone="warn" />
              ) : null}
            </>
          )}
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <button
            type="button"
            onClick={() => setStage({ name: "pick" })}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Choose a different file
          </button>
        </div>
      ) : null}

      {stage.name === "done" ? (
        <div className="py-6 text-center">
          <p className="text-base font-semibold text-slate-900">Import complete</p>
          <p className="mt-1 text-sm text-slate-600">
            {stage.result.created} added, {stage.result.updated} updated
            {stage.result.skipped > 0 ? `, ${stage.result.skipped} skipped (already imported)` : ""}.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function RulesNote() {
  return (
    <ul className="space-y-1 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
      <li>
        <strong className="font-medium text-slate-800">Payout</strong> = the amount Airbnb pays out to you, as shown
        in the file. The service fee is already taken out (saved for reference); the cleaning fee isn&apos;t
        subtracted — cleaners are paid a fixed amount separately.
      </li>
      <li>
        Each <strong className="font-medium text-slate-800">new</strong> stay is saved as Paid, with a completed,
        paid cleaning of {formatCurrency(DEFAULT_CLEANING_FEE)} (no cleaner named) and its expense.
      </li>
      <li>Airbnb doesn&apos;t export guest counts, so new bookings start at 1 guest — edit them later.</li>
    </ul>
  );
}

function PreviewRow({ p, checked, onToggle }: { p: PlannedRow; checked: boolean; onToggle: () => void }) {
  const { row } = p;
  return (
    <tr className={p.action === "skip" ? "text-slate-400" : undefined}>
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={checked}
          disabled={p.action === "skip"}
          onChange={onToggle}
          aria-label={`Import ${row.guestName}`}
          className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
        />
      </td>
      <td className="px-3 py-2 align-top font-medium text-slate-900">{row.guestName}</td>
      <td className="px-3 py-2 align-top whitespace-nowrap">
        {formatDateRange(row.checkIn, row.checkOut)}{" "}
        <span className="text-xs text-slate-400">· {nightCount(row.checkIn, row.checkOut)}n</span>
      </td>
      <td className="px-3 py-2 text-right align-top whitespace-nowrap tabular-nums">
        {formatCurrency(row.totalPayout)}
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {p.action === "create" ? <Badge tone="green">New</Badge> : null}
        {p.action === "skip" ? <Badge>Already imported</Badge> : null}
        {p.action === "update" ? (
          <span>
            <Badge tone="amber">Updates existing</Badge>
            <span className="mt-1 block text-slate-500">
              payout {formatCurrency(p.existing.totalPayout)} → {formatCurrency(row.totalPayout)}
            </span>
          </span>
        ) : null}
        {p.conflicts.length > 0 ? (
          <span className="mt-1 flex items-start gap-1 text-amber-700">
            <WarningIcon className="mt-px h-3.5 w-3.5 shrink-0" />
            Overlaps {p.conflicts.map((c) => c.guestName).join(", ")}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function Problems({ problems, tone }: { problems: string[]; tone: "warn" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`rounded-2xl px-4 py-3 text-xs ${tone === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
    >
      <p className="font-medium">{tone === "error" ? "Couldn't use this file" : "Notes on this file"}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {problems.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
